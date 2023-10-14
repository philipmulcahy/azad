/* Copyright(c) 2016-2020 Philip Mulcahy. */

'use strict';

import * as azad_order from './order';
import * as azad_table from './table';
import * as csv from './csv';
import * as extraction from './extraction';
import * as notice from './notice';
import * as request_scheduler from './request_scheduler';
import * as settings from './settings';
import * as signin from './signin';
import * as stats from './statistics';
import * as urls from './url';
import * as util from './util';

let scheduler: request_scheduler.IRequestScheduler | null = null;
let background_port: chrome.runtime.Port | null = null;
let years: number[] = [];
let stats_timeout: NodeJS.Timeout | null = null;

const SITE: string = urls.getSite();

function getScheduler(): request_scheduler.IRequestScheduler {
    if (!scheduler) {
        resetScheduler('unknown');
    }
    return scheduler!;
}

function getBackgroundPort() {
    return background_port;
}

function setStatsTimeout() {
    const sendStatsMsg = () => {
        const bg_port = getBackgroundPort();
        if (bg_port) {
            stats.publish(bg_port, getScheduler().purpose());
            azad_table.updateProgressBar();
        }
    }
    if (stats_timeout) {
        clearTimeout(stats_timeout);
    }
    stats_timeout = setTimeout(
        () => {
            setStatsTimeout();
            sendStatsMsg();
        },
        2000
    );
}

function resetScheduler(purpose: string): void {
    if (scheduler) {
        scheduler.abort();
    }
    scheduler = request_scheduler.create(purpose);
    setStatsTimeout();
}

let cached_years: Promise<number[]> | null = null;

async function getYears(): Promise<number[]> {
    async function getPromise(): Promise<number[]> {
        const url = 'https://' + SITE + '/gp/css/order-history?ie=UTF8&ref_=nav_youraccount_orders';
        const response = await signin.checkedFetch(url);
        const html_text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString( html_text, 'text/html');
        return extraction.get_years(doc);
    }
    let years = cached_years;
    if(!years) {
        console.log('getYears() needs to do something');
        years = getPromise();
    }
    console.log('getYears() returning ', years);
    return years;
}

async function latestYear(): Promise<number> {
  const all_years = await getYears();
  return all_years[0];
}

async function showOrdersOrItems(
  orders: azad_order.IOrder[],
  beautiful_table: boolean
): Promise<HTMLTableElement> {
    if (orders.length >= 500 && beautiful_table) {
        beautiful_table = false;
        notice.showNotificationBar(
            '500 or more orders found. That\'s a lot!\n' +
            'We\'ll start you off with a plain table to make display faster.\n' +
            'You can click the blue "datatable" button to restore sorting, filtering etc.',
            document
        );
    }

    const items_not_orders = await settings.getBoolean('show_items_not_orders');

    // TODO: remove the third param from this call, and chase the removal
    // all the way down the call tree below it.
    return azad_table.display(orders, beautiful_table, items_not_orders);
}

async function fetchAndShowOrdersByYears(
  years: number[]
): Promise<HTMLTableElement|undefined> {
    const ezp_mode: boolean = await settings.getBoolean('ezp_mode');
    if ( ! ezp_mode ) {
      if ( document.visibilityState != 'visible' ) {
          console.log(
              'fetchAndShowOrdersByYears() returning without doing anything: ' +
              'tab is not visible'
          );
          return;
      }
    }
    const purpose: string = years.join(', ');
    resetScheduler(purpose);
    const latest_year: number = await latestYear();
    const order_promises = await azad_order.getOrdersByYear(
        years,
        getScheduler(),
        latest_year,
        (_date: Date|null) => true,  // DateFilter predicate
    );
    return showOrdersOrItems(order_promises, true);
}

async function fetchAndShowOrdersByRange(
  start_date: Date, end_date: Date,
  beautiful_table: boolean
): Promise<HTMLTableElement|undefined> {
    console.info(`fetchAndShowOrdersByRange(${start_date}, ${end_date})`);
    if ( document.visibilityState != 'visible' ) {
        console.log(
            'fetchAndShowOrdersByRange() returning without doing anything: ' +
            'tab is not visible'
        );
        return;
    }
    const purpose: string
      = util.dateToDateIsoString(start_date)
      + ' -> '
      + util.dateToDateIsoString(end_date);
    resetScheduler(purpose);
    const latest_year: number = await latestYear();
    const orders = await azad_order.getOrdersByRange(
      start_date,
      end_date,
      getScheduler(),
      latest_year,
      function (d: Date|null): boolean {
        if (typeof(d) === 'undefined') {
          return false;
        }
        return d! >= start_date && d! <= end_date  // DateFilter
      },
    );
    return showOrdersOrItems(orders, beautiful_table);
}

async function fetchShowAndSendItemsByRange(
  start_date: Date,
  end_date: Date,
  destination_extension_id: string,
): Promise<void> {
  await settings.storeBoolean('ezp_mode', true);
  const original_items_setting = await settings.getBoolean('show_items_not_orders');
  await settings.storeBoolean('show_items_not_orders', true);
  const table: (HTMLTableElement|undefined) = await fetchAndShowOrdersByRange(
    start_date,
    end_date,
    false
  );
  await settings.storeBoolean('show_items_not_orders', original_items_setting);

  if (typeof(table) != 'undefined') {
    await csv.send_csv_to_ezp_peer(table, destination_extension_id)
    await settings.storeBoolean('ezp_mode', false);
    return;
  }
  else return undefined;
}

async function advertisePeriods() {
  const years = await getYears();
  console.log('advertising years', years);
  const bg_port = getBackgroundPort();
  const periods = [1, 2, 3].concat(years);
  if (bg_port) {
    try {
      bg_port.postMessage({
        action: 'advertise_periods',
        periods: periods
      });
    } catch (ex) {
      console.warn(
        'inject.advertisePeriods got: ', ex,
        ', perhaps caused by disconnected bg_port?');
    }
  }
}

async function registerContentScript() {
    // @ts-ignore null IS allowed as first arg to connect.
    background_port = chrome.runtime.connect(null, {name: 'azad_inject'});

    const bg_port = getBackgroundPort();
    if (bg_port) {
        bg_port.onMessage.addListener( msg => {
            try {
                switch(msg.action) {
                    case 'dump_order_detail':
                        azad_table.dumpOrderDiagnostics(msg.order_id)
                        break;
                    case 'scrape_years':
                        years = msg.years;
                        if (years) {
                            fetchAndShowOrdersByYears(years);
                        }
                        break;
                    case 'scrape_range':
                        {
                          const start_date: Date = new Date(msg.start_date);
                          const end_date: Date = new Date(msg.end_date);
                          fetchAndShowOrdersByRange(start_date, end_date, true);
                        }
                        break;
                    case 'scrape_range_and_dump_items':
                        {
                          const start_date: Date = new Date(msg.start_date);
                          const end_date: Date = new Date(msg.end_date);
                          fetchShowAndSendItemsByRange(
                            start_date,
                            end_date,
                            msg.sender_id);
                        };
                        break;
                    case 'clear_cache':
                        getScheduler().clearCache();
                        notice.showNotificationBar(
                            'Amazon Order History Reporter Chrome' +
                            ' Extension\n\n' +
                            'Cache cleared',
                            document
                        );
                        break;
                    case 'force_logout':
                        signin.forceLogOut('https://' + SITE);
                        break;
                    case 'abort':
                        resetScheduler('aborted');
                        break;
                    default:
                        console.warn('unknown action: ' + msg.action);
                }
            } catch (ex) {
                console.error('message handler blew up with ' + ex +
                              ' while trying to process ' + msg);
            }
        } );
    }
    console.log('script registered');
}

console.log('Amazon Order History Reporter starting');
registerContentScript();
advertisePeriods();

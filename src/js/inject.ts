/* Copyright(c) 2016-2020 Philip Mulcahy. */

'use strict';

import * as azad_order from './order';
import * as azad_table from './table';
import * as business from './business';
import * as csv from './csv';
import * as extraction from './extraction';
import * as iframeWorker from './iframe-worker';
const lzjs = require('lzjs');
import * as notice from './notice';
import * as periods from './periods';
import * as pageType from './page_type';
import * as ports from './ports';
import * as request_scheduler from './request_scheduler';
import * as settings from './settings';
import * as signin from './signin';
import * as stats from './statistics';
import * as transaction from './transaction';
import * as urls from './url';
import * as util from './util';

let scheduler: request_scheduler.IRequestScheduler | null = null;
let years: number[] = [];
let stats_timeout: NodeJS.Timeout | null = null;

const SITE: string = urls.getSite();

const _stats = new stats.Statistics();

function getScheduler(): request_scheduler.IRequestScheduler {
  if (!scheduler) {
    resetScheduler('unknown');
  }

  return scheduler!;
}

function setStatsTimeout() {
  const sendStatsMsg = async () => {
    await _stats.publish(ports.getBackgroundPort, getScheduler().purpose());
    azad_table.updateProgressBar(_stats);
  };

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

  _stats.clear();
  scheduler = request_scheduler.create(purpose, ports.getBackgroundPort, _stats);
  setStatsTimeout();
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
  const latest_year: number = await periods.getLatestYear();

  const order_promises = azad_order.getOrdersByYear(
    years,
    getScheduler(),
    latest_year,
    (_date: Date|null) => true,  // DateFilter predicate
  );

  return azad_table.display(order_promises, true);
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
  const latest_year: number = await periods.getLatestYear();

  const orders = azad_order.getOrdersByRange(
    start_date,
    end_date,
    getScheduler(),
    latest_year,
    function (d: Date|null): boolean {
      if (typeof(d) === 'undefined') {
        return false;
      }
      return d! >= start_date && d! <= end_date;  // DateFilter
    },
  );

  return azad_table.display(orders, beautiful_table);
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
    await csv.send_csv_to_ezp_peer(table, destination_extension_id);
    await settings.storeBoolean('ezp_mode', false);
    return;
  } else {
    return undefined;
  }
}

async function registerContentScript(isIframeWorker: boolean) {
  const pgType = pageType.getPageType();
  const bg_port = await ports.getBackgroundPort();

  if (bg_port) {
    bg_port.onMessage.addListener(
      msg => {
        try {
          handleMessageFromBackground(pgType, msg);
        } catch (ex) {
          console.error('message handler blew up with ' + ex +
                        ' while trying to process ' + msg);
        }
      }
    );

    if (isIframeWorker) {
      iframeWorker.requestInstructions(ports.getBackgroundPort);
    }
  } else {
    console.warn('no background port in registerContentScript()');
  }

  console.log('script registered');
}

function handleMessageFromBackground(pageType: string, msg: any): void {
  switch(pageType) {
    case 'azad_inject':
      handleMessageFromBackgroundToRootContentPage(msg);
      break;
    case 'azad_iframe_worker':
      iframeWorker.handleInstructionsResponse(msg);
      break;
    default:
      console.warn('unknown pageType:', pageType);
  }
}

function handleMessageFromBackgroundToRootContentPage(msg: any): void {
  switch(msg.action) {
    case 'dump_order_detail':
      resetScheduler('dump_order_detail');
      azad_table.dumpOrderDiagnostics(msg.order_id, getScheduler);
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
        const startDate: Date = new Date(msg.start_date);
        const endDate: Date = new Date(msg.end_date);
        fetchShowAndSendItemsByRange(
          startDate,
          endDate,
          msg.sender_id);
      }
      break;
    case 'start_iframe_worker':
      {
        const url = urls.normalizeUrl(msg.url, urls.getSite());
        iframeWorker.createIframe(url, msg.guid);
      }
      break;
    case 'remove_iframe_worker':
      iframeWorker.removeIframeWorker(msg.guid);
      break;
    case 'transactions':
      console.log('got transactions', msg.transactions);

      (async ()=>{
        if (!pageType.isWorker()) {
          await azad_table.displayTransactions(msg.transactions, true);
        }
      })();

      break;
    case 'clear_cache':
      getScheduler().cache().clear();
      transaction.clearCache();
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
      console.debug('inject.ts ignoring msg.action: ' + msg.action);
  }
}

function initialiseContentScript() {
  console.log('Amazon Order History Reporter content script initialising');

  const isWorker = pageType.isWorker();
  registerContentScript(isWorker);

  const inIframe = pageType.isIframe();

  if (!inIframe) {
    periods.init(ports.getBackgroundPort);
  }
}

initialiseContentScript();

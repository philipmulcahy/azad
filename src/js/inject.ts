/* Copyright(c) 2016-2020 Philip Mulcahy. */

'use strict';

import * as azad_order from './order';
import * as azad_table from './table';
import {dateToDateIsoString} from './date';
import * as git_hash from '../generated/git_hash';
import * as iframeWorker from './iframe-worker';
import * as notice from './notice';
import * as periods from './periods';
import * as pageType from './page_type';
import * as ports from './ports';
import * as request_scheduler from './request_scheduler';
import * as signin from './signin';
import * as stats from './statistics';
import * as transaction from './transaction';
import * as urls from './url';

let scheduler: request_scheduler.IRequestScheduler | null = null;
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
      void sendStatsMsg();
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
  years: number[],
  client: string,
): Promise<HTMLTableElement|undefined> {

  if ( document.visibilityState != 'visible' ) {
    console.log(
      'fetchAndShowOrdersByYears() returning without doing anything: ' +
      'tab is not visible'
    );
    return;
  }

  const purpose: string = years.join(', ');
  resetScheduler(purpose);

  const orderPromises = azad_order.getOrdersByYear(
    years,
    getScheduler(),
    () => true,
  );

  return azad_table.display(
    orderPromises, true, ports.getBackgroundPort, client);
}

async function fetchAndShowOrdersByRange(
  start_date: Date, end_date: Date,
  beautifulTable: boolean,
  client: string,
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
    = dateToDateIsoString(start_date)
    + ' -> '
    + dateToDateIsoString(end_date);

  resetScheduler(purpose);

  const orders = azad_order.getOrdersByRange(
    start_date,
    end_date,
    getScheduler(),
    function (d: Date|null): boolean {
      if (!d) {
        return false;
      }
      return d >= start_date && d <= end_date;
    },
  );

  return azad_table.display(
    orders, beautifulTable, ports.getBackgroundPort, client);
}

async function registerContentScript(isIframeWorker: boolean) {
  const pgType = pageType.getPageType();
  const bg_port = await ports.getBackgroundPort();

  if (bg_port) {
    bg_port.onMessage.addListener(
      msg => {
        try {
          handleMessageFromBackground(pgType, msg as Record<string, unknown>);
        } catch (ex) {
          console.error(`msg handler caught ${ex} while processing ${JSON.stringify(msg)}`
          );
        }
      }
    );

    if (isIframeWorker) {
      void iframeWorker.requestInstructions(ports.getBackgroundPort);
    }
  } else {
    console.warn('no background port in registerContentScript()');
  }

  console.log('script registered');
}

function handleMessageFromBackground(pageType: string, msg: Record<string, unknown>): void {
  switch(pageType) {
    case 'azad_inject':
      handleMessageFromBackgroundToRootContentPage(msg);
      break;
    case 'azad_iframe_worker':
      void iframeWorker.handleInstructionsResponse(msg);
      break;
    default:
      console.warn('unknown pageType:', pageType);
  }
}

function handleMessageFromBackgroundToRootContentPage(msg: Record<string, unknown>): void {
  const action = msg.action as string;
  switch(action) {
    case 'dump_order_detail':
      resetScheduler('dump_order_detail');
      azad_table.dumpOrderDiagnostics(msg.order_id as string, getScheduler);
      break;
    case 'scrape_years':
      {
        const years = msg.years as number[] | undefined;
        const client = msg.client as string;
        if (years) {
          void fetchAndShowOrdersByYears(years, client);
        }
      }
      break;
    case 'scrape_range':
      {
        const start_date: Date = new Date(msg.start_date as string);
        const end_date: Date = new Date(msg.end_date as string);
        const client = msg.client as string;
        void fetchAndShowOrdersByRange(
          start_date,
          end_date,
          true,
          client,
        );
      }
      break;
    case 'start_iframe_worker':
      {
        const url = urls.normalizeUrl(msg.url as string, urls.getSite());
        iframeWorker.createIframe(url, msg.guid as string, msg.purpose as string);
      }
      break;
    case 'remove_iframe_worker':
      iframeWorker.removeIframeWorker(msg.guid as string);
      break;
    case 'transactions':
      {
        console.log('got transactions', msg.transactions);
        const client = msg.client as string;
        void (async ()=>{
          if (!pageType.isWorker()) {
            await azad_table.displayTransactions(
              msg.transactions as transaction.Transaction[],
              true,
              ports.getBackgroundPort,
              client,
            );
          }
        })();
      }
      break;
    case 'clear_cache':
      getScheduler().cache().clear();
      transaction.clearCache();
      periods.YearsCache.clear();
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
      console.debug('inject.ts ignoring msg.action: ' + action);
  }
}

async function initialiseContentScript(): Promise<void> {
  console.log('Amazon Order History Reporter content script initialising');
  console.log(git_hash.text());

  const isWorker = pageType.isWorker();
  await registerContentScript(isWorker);

  if (!pageType.isIframe()) {
    document.documentElement.setAttribute('data-azad-extension-id', chrome.runtime.id);
    void periods.advertisePeriods();
  }
}

initialiseContentScript();

/* Copyright(c) 2025- Philip Mulcahy. */

/////////////////////////////////////////////////
//
//  ┌─────┐┌──────────┐┌───────┐┌──────┐┌──────┐ 
//  │POPUP││BACKGROUND││CONTENT││IFRAME││AMAZON│ 
//  └─┬───┘└─────┬────┘└───┬───┘└───┬──┘└───┬──┘ 
//    │          │         │        │       │   
//    │ action!  │         │        │       │   
//  1 ├────────►│││        │        │       │   
//    │         │││ action!│        │       │   
//  2 │         ││├──────►1│        │       │   
//    │         │││        │ setup  │       │   
//  3 │ remember│││        ├──────►1│       │   
//    │ proposed│││        │        │       │   
//    │ action  │││ what do│I do?   │       │   
//  4 │         │││◄───────┼────────┤       │   
//    │         │││        │        │       │   
//    │         │││  here's│what    │       │   
//  5 │         ││├────────┼───────►│ data? │   
//  6 │          │         │        ├──────►│   
//    │          │         │        │       │   
//    │          │         │        │ data  │
//  7 │          │      results     │◄──────┤   
//  8 │          │◄────────┼────────┤       │   
//    │          │         │        │       │   
//    │          │ display │        │       │   
//  9 │          ├───────►1│        │       │   
//    │          │         │        │       │   
//    │          │ remove  │        │       │
//    │          │ iframe  │        │       │
// 10 │          ├───────►*│        │       │   
//
// thanks https://asciiflow.com/
//
/////////////////////////////////////////////////

import * as inject from './inject';
import * as transaction from './transaction';
import * as urls from './url';
import * as util from './util';

interface IFrameTask {
  taskType: string,
  taskId: number,
  url: string,
}

export function isInIframeWorker(): boolean {
  const isInIframe = window.self !== window.top;
  const url = document.URL;
  const isInTransactionsPage = url.includes('/transactions');
  return isInIframe && isInTransactionsPage;
}

const IFRAME_ID = 'AZAD-IFRAME-WORKER';

// (10) Remove existing iframe if one exists.
export function removeIframeWorker(): void {
  if (isInIframeWorker()) {
    console.error('cannot start iframe task from an iframe');
  }

  const iframe = document.getElementById(IFRAME_ID);
  if (iframe) {
    iframe.remove();
  }
}

// (3) Called from the content page the iframe will be hosted by
export function createIframe(url: string): void {
  if (isInIframeWorker()) {
    console.error('cannot start iframe task from an iframe');
  }

  removeIframeWorker();
  const iframe = document.createElement('iframe') as HTMLIFrameElement;
  iframe.setAttribute('src', url);
  iframe.setAttribute('id', IFRAME_ID);
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  document.body.insertBefore(iframe, document.body.firstChild);
}

// (4) Called from iframe worker to background
export async function requestInstructions(
  getBackgroundPort: ()=>Promise<chrome.runtime.Port | null> 
): Promise<void> {
  const port = await getBackgroundPort();
  if (port ) {
    port.postMessage({action: 'get_iframe_task_instructions'});
  } else {
    console.warn('got null background port in iframe-worker');
  }
}

export async function handleInstructionsResponse(msg: any): Promise<void> {
  if (!isInIframeWorker()) {
    console.error('cannot start iframe task from outside an iframe');
  }
  const action = msg.action;
  switch (action) {
    case 'scrape_transactions':
      {
        if (
          msg.hasOwnProperty('start_date') &&
          msg.hasOwnProperty('end_date')
        ) {
          const startDate = new Date(msg.start_date);
          const endDate = new Date(msg.end_date);
          transaction.reallyScrapeAndPublish(
            inject.getBackgroundPort,
            startDate,
            endDate,
          );
        } else if (msg.hasOwnProperty('years')) {
          const years = (msg.years as string[]).map(ys => +ys).sort();
          const minYear = years.at(0)!;
          const maxYear = years.at(-1)!;
          const startDate = new Date(minYear, 0);
          const endDate = new Date(maxYear, 11, 31, 23, 59, 59, 999);
          transaction.reallyScrapeAndPublish(
            inject.getBackgroundPort,
            startDate,
            endDate,
          );
        }
      }
      break;
    default:
      console.warn(
        'iframe-worker.handleInstructionsResponse cannot handle', msg);
  }
}

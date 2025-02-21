/* Copyright(c) 2025- Philip Mulcahy. */

/////////////////////////////////////////////////
// Get Transactions
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
// Get Years
/////////////////////////////////////////////////
//
//  ┌─────┐┌──────────┐┌───────┐┌──────┐┌──────┐
//  │POPUP││BACKGROUND││CONTENT││IFRAME││AMAZON│
//  └─┬───┘└─────┬────┘└───┬───┘└───┬──┘└───┬──┘
//    │          │         │        │       │
//  1 │          │ action! │        │       │
//    │         │││◄───────┤        │       │
//    │         │││        │        │       │
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
//    │ display  │         │        │       │
//  9 │◄─────────┤         │        │       │
//    │          │         │        │       │
//    │          │ remove  │        │       │
//    │          │ iframe  │        │       │
// 10 │          ├───────►*│        │       │
//
/////////////////////////////////////////////////
// Get Processed HTML
/////////////////////////////////////////////////
//
//  ┌─────┐┌──────────┐┌───────┐┌──────┐┌──────┐
//  │POPUP││BACKGROUND││CONTENT││IFRAME││AMAZON│
//  └─┬───┘└─────┬────┘└───┬───┘└───┬──┘└───┬──┘
//    │          │         │        │       │
//  1 │          │  fetch! │        │       │
//    │         │││◄───────┤        │       │
//    │         │││        │        │       │
//    │         │││ fetch! │        │       │
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
//    │          │ results │        │       │
//  9 │          ├───────►*┤        │       │
//    │          │         │        │       │
//    │          │ remove  │        │       │
//    │          │ iframe  │        │       │
// 10 │          ├───────►*│        │       │
//
/////////////////////////////////////////////////

import * as extraction from './extraction';
import * as inject from './inject';
import * as periods from './periods';
import * as transaction from './transaction';
import * as urls from './url';
import * as util from './util';	
import { v4 as uuidv4 } from 'uuid';

export function isInIframe(): boolean {
  const wellIsIt = window.self !== window.top;
  return wellIsIt;
}

export function isInIframeWorker(): boolean {
  const inIframe = isInIframe();
  const url = document.URL;

  const isInTransactionsPage = url.includes('/transactions') ||
                               url.includes('/order-history');

  return inIframe && isInTransactionsPage;
}

const IFRAME_ID = 'AZAD-IFRAME-WORKER';

// (10) Remove existing iframe if one exists.
export function removeIframeWorker(): void {
  if (isInIframeWorker()) {
    console.error('cannot start iframe task from an iframe');
    return;
  }

  const iframe = document.getElementById(IFRAME_ID);

  if (iframe) {
    const url = iframe.getAttribute('url');
    iframe.remove();
    console.log('removed iframe', url);
  } else {
    console.warn('failed to find an iframe to remove');
  }
}

// (3) Called from the content page the iframe will be hosted by
export function createIframe(url: string): void {
  if (isInIframeWorker()) {
    console.error('cannot start iframe task from an iframe');
  }

  console.log('starting iframe worker:', url);

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
  if (port) {
    port.postMessage({action: 'get_iframe_task_instructions'});
  } else {
    console.warn('got null background port in iframe-worker');
  }
}

export type FetchResponse = {
	url: string,
	html: string,
};

/**
 * Use an iframe to fetch a URL, wait for its javascript to run (enough), and
 * then respond with the mutated HTML.
 *
 * @param url the URL whose HTML we desire.
 * @param xpath that will match when the HTML is properly "baked".
 * @returns
 */
export async function fetchURL(
  url: string,
  xpath: string,
): Promise<FetchResponse> {
	const guid: string = uuidv4();
	const port: chrome.runtime.Port = await inject.getBackgroundPort() as chrome.runtime.Port;

	const requestMsg = {
		url,
		xpath,
		guid,
  };
	
	const result = new Promise<FetchResponse>(function (resolve, reject) {
		port.onMessage.addListener((msg) => {
			const action = msg.action;
			if (action != 'fetch_url_response') {
				return;
			}

			const responseGuid = msg.guid;
			if (responseGuid != guid) {
				return;
			}

			if (msg.status != 'OK') {
				reject(msg.status);
				return;
			}
			
			resolve({
				url,
				html: msg.html,
			});
    })
	});

	port.postMessage(requestMsg);
	return result;
}

export async function handleInstructionsResponse(msg: any): Promise<void> {
  if (!isInIframeWorker()) {
    console.error('cannot start iframe task from outside an iframe');
  }

  const action = msg.action;
  switch (action) {
    case 'scrape_periods':
      periods.advertisePeriods(inject.getBackgroundPort);
      break;
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
		case 'fetch_url':
      {
				const url: string = msg.url;
        const completionXPath: string = msg.xpath;
        const guid: string = msg.guid;
				let html = '';
				let status = 'OK';

				try {
					html = await fetchUrl(url, completionXPath);
				} catch (ex) {
					status = ex as string;
				}

				const port = await inject.getBackgroundPort() as chrome.runtime.Port;
				port.postMessage({
					action: 'fetch_url_response',
					url,
					guid,
					status,
				});
			}
      break;
    default:
      console.warn(
        'iframe-worker.handleInstructionsResponse cannot handle', msg);
  }
}

/**
 * Repeatedly polls the document to see if xpath matches.
 * If it doesn't match for long enough, the function times out + returns false.
 * If it matches, it immediately returns true.
 * @param xpath - xpath string to attempt matching.
 * @returns boolean: true for matched, false for timed out.
 */
async function waitForXPathToMatch(
  doc: HTMLDocument,
  xpath: string,
): Promise<boolean> {
  let elapsedMillis: number = 0;
  const DEADLINE_MILLIS = 10 * 1000;
  const INCREMENT_MILLIS = 500;

  while (elapsedMillis <= DEADLINE_MILLIS) {
    console.log('waitForXPathToMatch waiting', INCREMENT_MILLIS);
    await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
    elapsedMillis += INCREMENT_MILLIS;
    console.log('elapsedMillis', elapsedMillis);

    const match = extraction.findSingleNodeValue(
			xpath,
			doc.documentElement,
			'waitForXPathToMatch'
		);

    if (match != null) {
      console.log('waitForXpathToMatch matched');
      return true;
    }
  };

	console.warn('waitForXPathToMatch timing out');
  return false;
}

/**
 * Fetch a url into the iframe, and then poll for the xpath to match.
 * Q: Why might we need to wait?
 * A: To allow site javascript to run, mutating the document.
 * @param url - xpath string to attempt matching.
 * @param completionXPath - xpath string to attempt matching.
 * @param guid - unique identifier of the request, so that the recipient of the
                 the result knows it is for them.
 * @returns string: "baked" html.
 * @throws string: comments on failure.
 */
async function fetchUrl(
	url: string,
	completionXPath: string,
): Promise<string> {
	if (document.URL != url) {
		console.error(
			'instructions to this iframe expected url', url,
			'but it is actually', document.URL
		);
		return '';
	}

	const matched = await waitForXPathToMatch(document, completionXPath);
	const port = await inject.getBackgroundPort();
	const html = document.documentElement.outerHTML;
	return html;
}

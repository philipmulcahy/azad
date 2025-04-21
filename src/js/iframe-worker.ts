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
// Get Processed/Cooked HTML
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
//  9 │          ├───────►*│        │       │
//    │          │         │        │       │
//    │          │ remove  │        │       │
//    │          │ iframe  │        │       │
// 10 │          ├───────►*│        │       │
//
/////////////////////////////////////////////////

import * as extraction from './extraction';
import * as inject from './inject';
import * as pageType from './page_type';
import * as periods from './periods';
import * as ports from './ports';
import * as transaction from './transaction';
import * as urls from './url';
import * as util from './util';
import { v4 as uuidv4 } from 'uuid';

const IFRAME_CLASS = 'azad-iframe-worker';
const IFRAME_CONTAINER_CLASS = 'azad-iframe-worker-container';
const IFRAME_BOX_ID = 'azad-iframe-box';

async function relayToParent(msg: any) {
  if (!pageType.isWorker()) {
    console.error(
      'Only an iframe worker can ask for a message to be relayed to its ' +
      'parent.');

    return;
  }

  const wrappedMsg = {
    action: 'relay_to_parent',
    msg,
  };

  const port = await ports.getBackgroundPort();

  if (!port) {
    console.warn('relayToParent has no port to post to');
  }

  port?.postMessage(wrappedMsg);
}

// (3) Called from the content page the iframe will be hosted by
export function createIframe(url: string, guid: string): void {
  if (pageType.isWorker()) {
    console.error('cannot start iframe task from an iframe', guid);
  }

  console.log('starting iframe worker:', url);

  const container = document.createElement('div') as HTMLDivElement;
  container.setAttribute('class', IFRAME_CONTAINER_CLASS);

  const iframe = document.createElement('iframe') as HTMLIFrameElement;
  iframe.setAttribute('src', url);
  iframe.setAttribute('name', guid);
  iframe.setAttribute('class', IFRAME_CLASS);

  container.append(url)
  container.append(document.createElement('br'));
  container.append(guid);
  container.appendChild(iframe);
  getIframeContainer().appendChild(container);

  console.log('createIframe created', guid);
}

// (4) Called from iframe worker to background
export async function requestInstructions(
  getBackgroundPort: ()=>Promise<chrome.runtime.Port | null>
): Promise<void> {
  const guid = window.name;
  const port = await getBackgroundPort();

  if (port) {
    port.postMessage({
      action: 'get_iframe_task_instructions',
      guid
    });
  } else {
    console.warn('got null background port in iframe-worker');
  }
}

export type FetchResponse = {
  url: string,
  html: string,
};

// (10) Remove existing iframe if one exists.
// Assumes that we are in the parent/enclosing content page.
export function removeIframeWorker(guid: string): void {
  if (pageType.isIframe()) {
    console.error('cannot remove worker iframe from an iframe', guid);
    return;
  }

  const candidates: HTMLCollectionOf<Element>
    = document.getElementsByClassName(IFRAME_CLASS);
  
  if (candidates.hasOwnProperty(guid)) {
    const iframe = candidates?.namedItem(guid) as HTMLIFrameElement;
    const container = iframe.parentNode as HTMLDivElement;
    const box = container.parentNode as HTMLDivElement;
    iframe.remove();
    container.remove();
    console.log(`removed iframe ${guid}`);
  }

  removeIframeContainerIfPresentAndEmpty();
}

// (10) Removee this iframe, by asking (via background) our parent to do so.
// Assumes that we are in an iframe worker.
function removeThisIframe(): void {
  if (!pageType.isIframe()) {
    console.error(
      'Cannot request removal if an iframe worker if we are not inside ' +
      '_that_ worker.'
    );

    return;
  }

  const guid = window.name;

  relayToParent({
    action: 'remove_iframe_worker',
    url: document.URL,
    guid,
  });

  console.log(`removeThisIframe ${guid}`);
}

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

  const requestMsg = {
    action: 'fetch_url',
    url,
    xpath,
    guid,
  };

  const result = new Promise<FetchResponse>(async function (resolve, reject) {
    const port: chrome.runtime.Port = await ports.getBackgroundPort() as chrome.runtime.Port;

    port.onMessage.addListener((msg) => {
      if (msg.action != 'fetch_url_response') {
        return;
      }

      if (msg.guid != guid) {
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

  try {
    const port: chrome.runtime.Port = await ports.getBackgroundPort() as chrome.runtime.Port;
    port.postMessage(requestMsg);
    console.log('fetchURL requested', url, xpath, guid);
  } catch (ex) {
    console.error('failed to post message to background script', ex);
  }

  return result;
}

export async function handleInstructionsResponse(msg: any): Promise<void> {
  if (!pageType.isWorker()) {
    console.error('cannot start iframe task from outside an iframe');
  }

  const action = msg.action;

  switch (action) {
    case 'scrape_periods':
      periods.advertisePeriods(ports.getBackgroundPort);
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
            ports.getBackgroundPort,
            startDate,
            endDate,
          );
        } else if (msg.hasOwnProperty('years')) {
          const years = (msg.years as string[]).map(ys => +ys).sort();
          const minYear = years.at(0)!;
          const maxYear = years.at(-1)!;
          const startDate = new Date(minYear, 0);
          const endDate = new Date(maxYear, 11, 31, 23, 59, 59, 999);

          await transaction.reallyScrapeAndPublish(
            ports.getBackgroundPort,
            startDate,
            endDate,
          );

          await removeThisIframe();
        }
      }
      break;
    case 'fetch_url':
      {
        if (msg.url != document.documentURI) {
          console.debug(
            'fetch_url wants', msg.url, 'but this iframe has', document.documentURI
          );
        } else {
          const completionXPath: string = msg.xpath;
          const guid: string = msg.guid;
          let html = '';
          let status = 'OK';

          try {
            html = await getBakedHtml(msg.url, completionXPath);
          } catch (ex) {
            status = ex as string;
          }

          await relayToParent({
            action: 'fetch_url_response',
            url: msg.url,
            html,
            guid,
            status,
          });

          await removeThisIframe();
        }
      }
      break;
    default:
      console.warn(
        'iframe-worker.handleInstructionsResponse cannot handle', msg);
  }
}

/**
 * Return the div that contains any iframe workers.
 * If it doesn't already exist, create it.
 * @returns HTMLDivElement
 */
function getIframeContainer(): HTMLDivElement {
  const existing = document.getElementById(IFRAME_BOX_ID);

  if (existing) {
    return existing as HTMLDivElement;
  }

  const newOne: HTMLDivElement = document.createElement('div');
  newOne.setAttribute('id', IFRAME_BOX_ID);
  document.body.insertBefore(newOne, document.body.firstChild);

  return newOne;
}

function removeIframeContainerIfPresentAndEmpty(): void {
  const existing = document.getElementById(IFRAME_BOX_ID);

  if (existing) {
    const empty = existing.children.length == 0;

    if (empty) {
      existing.remove();
      console.log('removed iframe worker box');
    }
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
  const url = doc.documentURI;

  function matched(): boolean {
    try {
      const match = extraction.findSingleNodeValue(
        xpath,
        doc.documentElement,
        'waitForXPathToMatch'
      );

      if (match != null) {
        console.log(`waitForXpathToMatch matched ${url} ${xpath}`);
        return true;
      }
    } catch (_ex) {
      // Do nothing: I should not have had findSingleNodeValue throw when it
      // doesn't find stuff.
    }
    return false;
  }

  while (elapsedMillis <= DEADLINE_MILLIS) {
    console.log(`waitForXPathToMatch waiting ${INCREMENT_MILLIS} ${url} ${xpath}`);
    await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
    elapsedMillis += INCREMENT_MILLIS;
    console.log(`waitForXPathToMatch elapsedMillis ${elapsedMillis}, ${url}, ${xpath}`);

    if (matched()) {
      console.log(`waitForXPathToMatch complete ${url} ${xpath}`);
      return true;
    }
  }

  // One last time after the timer has expired, because there's no guarantee
  // that we've tested even once so far.
  if (matched() ) {
    return true;
  }

  console.warn('waitForXPathToMatch timing out', url, xpath);
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
async function getBakedHtml(
  url: string,
  completionXPath: string,
): Promise<string> {
  if (document.URL != url) {
    const msg = 
      'fetch_url instructions to this iframe expected url: ' +  url +
      'but it is actually: ' + document.URL;

    console.error(msg);
    throw msg;
  }

  console.log(`getBakedHtml(${url}, ${completionXPath}) starting`);
  const matched = await waitForXPathToMatch(document, completionXPath);
  const bakedHtml = document.documentElement.outerHTML;

  if (bakedHtml == '') {
    console.warn(
      'getBakedHtml returning empty string for', url, completionXPath);
  } else {
    console.log(`getBakedHtml(${url}, ${completionXPath}) complete`);
  }

  return bakedHtml;
}

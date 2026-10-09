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
import * as pageType from './page_type';
import * as ports from './ports';
import * as transaction from './transaction';
import * as urls from './url';
import * as util from './util';
import { v4 as uuidv4 } from 'uuid';

// How long fetchURL waits for its iframe worker to answer: the page has to
// load, and then waitForXPathToMatch may poll for up to 10s.
export const FETCH_URL_TIMEOUT_MILLIS = 60 * 1000;

const IFRAME_CLASS = 'azad-iframe-worker';
const IFRAME_CONTAINER_CLASS = 'azad-iframe-worker-container';
const IFRAME_BOX_ID = 'azad-iframe-box';

export type IframeInstructionMessage =
  | { action: 'scrape_transactions'; client?: string; start_date?: string; end_date?: string; years?: string[] }
  | { action: 'fetch_url'; url: string; xpath: string; guid: string };

export type FetchUrlResponseWithGuid = {
  action: 'fetch_url_response';
  guid: string;
  status: string;
  html: string;
  url: string;
};

async function relayToParent(msg: Record<string, unknown> | FetchUrlResponseWithGuid) {
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
export function createIframe(
  url: string,
  guid: string,
  purpose: string,  // only for display/debug: not for control.
): void {
  if (pageType.isWorker()) {
    console.error('cannot start iframe task from an iframe', guid);
  }

  console.log('starting iframe worker:', url);

  const container = document.createElement('div') as HTMLDivElement;
  container.setAttribute('class', IFRAME_CONTAINER_CLASS);
  getIframeContainer().appendChild(container);

  const appendChild = function (
    parent: Node, type: string, cls: string, text: string | null
  ): HTMLElement {
    const child = document.createElement(type);
    child.setAttribute('class', cls);

    if (text) {
      child.innerText = text;
    }

    parent.appendChild(child);
    return child;
  };

  appendChild(
    container,
    'div',
    'azad-iframe-worker-title',
    `Azad dynamic task: ${purpose}`
  );

  appendChild(
    appendChild(container, 'div', '', null),  // ugly - parent embedded in call!
    'a',
    'azad-iframe-worker-url',
    url
  ).setAttribute('href', url);

  appendChild(container, 'div', 'azad-iframe-worker-guid', guid);

  // Q: Why not use the appendChild helper function as for the children above?
  // A: Because we'd lose control over when the embedded scripts start, and 
  // they'd get confused (by, for example, not being able to see their guid).
  const iframe = document.createElement('iframe');
  iframe.setAttribute('class', IFRAME_CLASS);
  iframe.setAttribute('name', guid);
  iframe.setAttribute('src', url);
  container.appendChild(iframe);  // this seems to be when scripts start running

  console.log('createIframe created', guid);
}

// (4) Called from iframe worker to background
export async function requestInstructions(
  getBackgroundPort: () => Promise<chrome.runtime.Port | null>
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

  if (Object.prototype.hasOwnProperty.call(candidates, guid)) {
    const iframe = candidates?.namedItem(guid) as HTMLIFrameElement;
    const container = iframe.parentNode as HTMLDivElement;
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

  void relayToParent({
    action: 'remove_iframe_worker',
    url: document.URL,
    guid,
  } as Record<string, unknown>);

  console.log(`removeThisIframe ${guid}`);
}

/**
 * Use an iframe to fetch a URL, wait for its javascript to run (enough), and
 * then respond with the mutated HTML.
 *
 * @param url the URL whose HTML we desire.
 * @param xpath that will match when the HTML is properly "baked".
 * @param purpose visual note about why this execution task is active
 * @param timeoutMillis give up (and remove the iframe) after this long.
 * @returns
 * @throws string: starts with "Timed out" if the worker never answered.
 */
export function fetchURL(
  url: string,
  xpath: string,
  purpose: string,
  timeoutMillis: number = FETCH_URL_TIMEOUT_MILLIS,
): Promise<FetchResponse> {
  const guid: string = uuidv4();

  const requestMsg = {
    action: 'fetch_url',
    url,
    xpath,
    guid,
    purpose,
  };

  return new Promise<FetchResponse>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    const listener = (msg: unknown) => {
      const response = msg as FetchUrlResponseWithGuid;
      if (response.action != 'fetch_url_response') {
        return;
      }

      if (response.guid != guid) {
        return;
      }

      finish();

      if (response.status != 'OK') {
        reject(response.status);
        return;
      }

      resolve({
        url,
        html: response.html,
      });
    };

    // Each call adds a listener: take it away again once we're done, or a
    // long scrape piles up hundreds of them.
    const finish = () => {
      clearTimeout(timer);
      ports.removeMessageListener(listener);
    };

    timer = setTimeout(() => {
      finish();

      // The worker may never have started (Amazon sent it somewhere we
      // don't run), so it won't remove itself.
      if (!pageType.isIframe()) {
        removeIframeWorker(guid);
      }

      // request.ts treats a rejection starting "Timed out" as a timeout.
      const msg = `Timed out after ${timeoutMillis}ms waiting for iframe ` +
                  `worker ${guid} to fetch ${url}`;

      console.warn(msg);
      reject(msg);
    }, timeoutMillis);

    ports.getBackgroundPort().then((port) => {
      if (!port) {
        finish();
        reject('Could not obtain background port');
        return;
      }

      ports.addMessageListener(listener);
      port.postMessage(requestMsg);
      console.log('fetchURL requested', url, xpath, guid);
    }).catch((ex) => {
      console.error('failed to post message to background script', ex);
      finish();
      reject(ex);
    });
  });
}

export async function handleInstructionsResponse(msg: unknown): Promise<void> {
  if (!pageType.isWorker()) {
    console.error('cannot start iframe task from outside an iframe');
  }

  const typedMsg = msg as IframeInstructionMessage;
  const action = typedMsg.action;

  switch (action) {
    case 'scrape_transactions':
      {
        if (pageType.isSignInPage(document.URL)) {
          // There are no transactions to scrape here, and publishing an
          // empty list would look like a real answer. The transactions
          // message has no way to carry a failure, so just clear up.
          console.warn(
            'scrape_transactions was redirected to sign-in:', document.URL);

          removeThisIframe();
        } else if (
          Object.prototype.hasOwnProperty.call(typedMsg, 'start_date') &&
          Object.prototype.hasOwnProperty.call(typedMsg, 'end_date')
        ) {
          const dateMessage = typedMsg as { start_date: string; end_date: string; client?: string };
          const startDate = new Date(dateMessage.start_date);
          const endDate = new Date(dateMessage.end_date);
          transaction.reallyScrapeAndPublish(
            ports.getBackgroundPort,
            startDate,
            endDate,
            typedMsg.client ?? '',
          );
        } else if (Object.prototype.hasOwnProperty.call(typedMsg, 'years')) {
          const years = (typedMsg.years as string[]).map(ys => +ys).sort();
          const minYear = years.at(0)!;
          const maxYear = years.at(-1)!;
          const startDate = new Date(minYear, 0);
          const endDate = new Date(maxYear, 11, 31, 23, 59, 59, 999);

          await transaction.reallyScrapeAndPublish(
            ports.getBackgroundPort,
            startDate,
            endDate,
            typedMsg.client ?? '',
          );

          await removeThisIframe();
        }
      }
      break;
    case 'fetch_url':
      {
        const completionXPath: string = typedMsg.xpath;
        const guid: string = typedMsg.guid;

        const respond = async (html: string, status: string) => {
          await relayToParent({
            action: 'fetch_url_response',
            url: typedMsg.url,
            html,
            guid,
            status,
          });

          await removeThisIframe();
        };

        if (pageType.isSignInPage(document.URL)) {
          // Amazon wants the user to sign in again: this page isn't going to
          // turn into the one we asked for, so say so now.
          const msg = `fetch_url for ${typedMsg.url} was redirected to ` +
                      `sign-in: ${document.URL}`;

          console.warn(msg);
          await respond('', msg);
        } else if (!urls.isSameDestination(typedMsg.url, document.URL)) {
          // Maybe a page on the way to the one we want: if it gets there,
          // inject.ts asks for instructions again from there. If it doesn't,
          // fetchURL's timeout gives up on it.
          console.warn(
            'fetch_url wants', typedMsg.url, 'but this iframe has', document.URL
          );
        } else {
          let html = '';
          let status = 'OK';

          try {
            html = await getBakedHtml(typedMsg.url, completionXPath);
          } catch (ex) {
            status = ex as string;
          }

          await respond(html, status);
        }
      }
      break;
    default:
      console.warn(
        'iframe-worker.handleInstructionsResponse cannot handle', typedMsg);
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
 * @param doc - the doc we're observing.
 * @param xpath - xpath string to attempt matching. If empty then match after
 *                timing out.
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
  const backgroundPort = await ports.getBackgroundPort();

  function sendKeepAlive() {
    backgroundPort?.postMessage({ action: 'keepalive' });
  }

  function matched(): boolean {
    if (xpath == '') {
      return false;
    }

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
    } catch (ex) {
      const exs = util.stringifyError(ex);
      const msg = `waitForXPathToMatch - match - findSingleNodeValue threw: ${exs}`;
      console.debug(msg);
      // Do nothing: I should not have had findSingleNodeValue throw when it
      // doesn't find stuff.
    }

    return false;
  }

  while (elapsedMillis <= DEADLINE_MILLIS) {
    console.log(`waitForXPathToMatch waiting ${INCREMENT_MILLIS} ${url} ${xpath}`);
    sendKeepAlive();
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
  if (matched() || xpath == '') {
    sendKeepAlive();
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
 * @param completionXPath - xpath string to attempt matching. If empty, then
 * completion is deemed after 10s.
 * @returns string: "baked" html.
 * @throws string: comments on failure.
 */
async function getBakedHtml(
  url: string,
  completionXPath: string,
): Promise<string> {
  if (!urls.isSameDestination(url, document.URL)) {
    const msg =
      'fetch_url instructions to this iframe expected url: ' + url +
      ' but it is actually: ' + document.URL;

    console.error(msg);
    throw msg;
  }

  console.log(`getBakedHtml(${url}, ${completionXPath}) starting`);
  await waitForXPathToMatch(document, completionXPath);
  const bakedHtml = document.documentElement.outerHTML;

  if (bakedHtml == '') {
    console.warn(
      'getBakedHtml returning empty string for', url, completionXPath);
  } else {
    console.log(`getBakedHtml(${url}, ${completionXPath}) complete`);
  }

  return bakedHtml;
}

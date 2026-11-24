/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as jsdom from 'jsdom';
import * as iframeWorker from '../../js/iframe-worker';
import * as pageType from '../../js/page_type';
import * as urls from '../../js/url';

describe('isSameDestination', () => {
  test.each([
    // [requested, actual]
    ['https://www.amazon.com/your-orders/orders?timeFilter=year-2025&startIndex=10',
     'https://www.amazon.com/your-orders/orders?timeFilter=year-2025&startIndex=10'],
    ['https://www.amazon.com/your-orders/orders?timeFilter=year-2025&startIndex=10&language=en_US',
     'https://www.amazon.com/your-orders/orders?startIndex=10&timeFilter=year-2025&ref_=ppx_yo2ov'],
    ['/your-orders/orders?startIndex=10',
     'https://www.amazon.com/your-orders/orders?startIndex=10'],
    ['https://www.amazon.com/your-orders/orders/',
     'https://WWW.AMAZON.COM/your-orders/orders'],
  ])('%s ends up at %s', (requested, actual) => {
    expect(urls.isSameDestination(requested, actual)).toBe(true);
  });

  test.each([
    ['https://www.amazon.com/your-orders/orders?startIndex=10',
     'https://www.amazon.com/ap/signin?openid.return_to=...'],
    ['https://www.amazon.com/your-orders/orders',
     'https://www.amazon.co.uk/your-orders/orders'],
    ['https://www.amazon.com/your-orders/order-details?orderID=1',
     'https://www.amazon.com/your-orders/orders'],
  ])('%s is not %s', (requested, actual) => {
    expect(urls.isSameDestination(requested, actual)).toBe(false);
  });
});

// page_type and ports read window and document; give them a jsdom page.
type Globals = {window?: unknown, document?: unknown, chrome?: unknown};
const g = globalThis as unknown as Globals;

function useDom(dom: jsdom.JSDOM) {
  g.window = dom.window;
  g.document = dom.window.document;
}

afterEach(() => {
  delete g.window;
  delete g.document;
});

describe('page_type.isWorker', () => {
  const GUID = '0b5f3c1e-7d2a-4c3b-9e8f-1a2b3c4d5e6f';

  // An iframe at url, with the given window name. page_type only reads
  // window.self, window.top, window.name and document.URL, and jsdom can't
  // nest real browsing contexts, so plain objects do.
  function iframeAt(url: string, name: string) {
    g.window = {self: {}, top: {}, name};
    g.document = {URL: url};
  }

  test('an orders page in one of our iframes', () => {
    iframeAt('https://www.amazon.com/your-orders/orders?startIndex=10', GUID);
    expect(pageType.isWorker()).toBe(true);
  });

  test('a sign-in page in one of our iframes', () => {
    iframeAt('https://www.amazon.com/ap/signin?openid.return_to=x', GUID);
    expect(pageType.isWorker()).toBe(true);
  });

  test('a sign-in page in someone else\'s iframe', () => {
    iframeAt('https://www.amazon.com/ap/signin?openid.return_to=x', 'login-frame');
    expect(pageType.isWorker()).toBe(false);
  });

  test('a sign-in page at the top level', () => {
    useDom(new jsdom.JSDOM('<html></html>', {url: 'https://www.amazon.com/ap/signin'}));
    expect(pageType.isWorker()).toBe(false);
  });
});

describe('fetchURL', () => {
  type Listener = (msg: unknown) => void;

  // Stands in for chrome.runtime.connect's port. When fetchURL asks for a
  // page, it makes the iframe (as background.ts + inject.ts would) but
  // otherwise does nothing, like a worker that never reports back.
  class FakePort {
    listeners: Listener[] = [];
    disconnectListeners: (() => void)[] = [];
    posted: Record<string, unknown>[] = [];

    onMessage = {
      addListener: (l: Listener) => { this.listeners.push(l); },
      removeListener: (l: Listener) => {
        this.listeners = this.listeners.filter(x => x !== l);
      },
    };

    onDisconnect = {
      addListener: (l: () => void) => { this.disconnectListeners.push(l); },
    };

    postMessage(msg: Record<string, unknown>) {
      this.posted.push(msg);

      if (msg.action == 'fetch_url') {
        iframeWorker.createIframe(
          msg.url as string, msg.guid as string, msg.purpose as string);
      }
    }

    deliver(msg: unknown) {
      [...this.listeners].forEach(l => l(msg));
    }
  }

  let port: FakePort;

  beforeAll(() => {
    port = new FakePort();
    g.chrome = {runtime: {connect: () => port}};
  });

  afterAll(() => {
    // stop ports.ts's keepalive interval
    port.disconnectListeners.forEach(l => l());
    delete g.chrome;
  });

  beforeEach(() => {
    useDom(new jsdom.JSDOM('<html><body></body></html>', {
      url: 'https://www.amazon.com/your-orders/orders',
    }));
  });

  const URL = 'https://www.amazon.com/your-orders/orders?startIndex=10';

  test('gives up after the timeout, and cleans up after itself', async () => {
    const listenersBefore = port.listeners.length;
    const fetched = iframeWorker.fetchURL(URL, '//div', 'test', 100);

    await expect(fetched).rejects.toMatch(/^Timed out after 100ms/);
    expect(port.listeners.length).toEqual(listenersBefore);

    const doc = g.document as Document;
    expect(doc.getElementsByClassName('azad-iframe-worker').length).toEqual(0);
  });

  test('resolves with the worker\'s answer, and removes its listener', async () => {
    const listenersBefore = port.listeners.length;
    const fetched = iframeWorker.fetchURL(URL, '//div', 'test', 5000);

    // Wait for fetchURL to post its request, then answer it.
    await new Promise(r => setTimeout(r, 10));
    const request = port.posted[port.posted.length - 1];

    port.deliver({
      action: 'fetch_url_response',
      guid: request.guid,
      status: 'OK',
      html: '<html>baked</html>',
      url: URL,
    });

    await expect(fetched).resolves.toEqual({url: URL, html: '<html>baked</html>'});
    expect(port.listeners.length).toEqual(listenersBefore);
  });

  test('passes on a worker\'s failure', async () => {
    const fetched = iframeWorker.fetchURL(URL, '//div', 'test', 5000);
    await new Promise(r => setTimeout(r, 10));
    const request = port.posted[port.posted.length - 1];

    port.deliver({
      action: 'fetch_url_response',
      guid: request.guid,
      status: 'fetch_url for x was redirected to sign-in: y',
      html: '',
      url: URL,
    });

    await expect(fetched).rejects.toMatch(/redirected to sign-in/);
  });
});

/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as tabPorts from '../../js/tab_ports';

// background.ts starts ExtPay when it loads: not wanted here.
jest.mock('../../js/extpay_client', () => ({}));

type Listener = (msg: unknown) => void;

// Enough of a chrome.runtime.Port for background.ts.
class FakePort {
  name: string;
  sender: {tab: {id: number}, url: string};
  posted: Record<string, unknown>[] = [];
  messageListeners: Listener[] = [];

  onMessage = {addListener: (l: Listener) => { this.messageListeners.push(l); }};
  onDisconnect = {addListener: () => {}};

  constructor(name: string, tabId: number, url: string) {
    this.name = name;
    this.sender = {tab: {id: tabId}, url};
  }

  postMessage(msg: Record<string, unknown>) { this.posted.push(msg); }

  // A message from the content page to the background page.
  send(msg: unknown) { this.messageListeners.forEach(l => l(msg)); }

  actions(): string[] { return this.posted.map(m => m.action as string); }
}

function asPorts(ports: FakePort[]): Record<string, chrome.runtime.Port> {
  const result: Record<string, chrome.runtime.Port> = {};

  ports.forEach(p => {
    result[`${p.name}#${p.sender.tab.id}#${p.sender.url}`] =
      p as unknown as chrome.runtime.Port;
  });

  return result;
}

describe('tab_ports.rootPortsInTab', () => {
  const a = new FakePort('azad_inject:1', 1, 'https://www.amazon.com/a');
  const b = new FakePort('azad_inject:2', 2, 'https://www.amazon.com/b');
  const aWorker = new FakePort('azad_iframe_worker:3', 1, 'https://www.amazon.com/w');

  test('finds the root page in the tab', () => {
    expect(tabPorts.rootPortsInTab(asPorts([a, b, aWorker]), 1))
      .toEqual([a]);
    expect(tabPorts.rootPortsInTab(asPorts([a, b, aWorker]), 2))
      .toEqual([b]);
  });

  test('finds nothing for an unknown or missing tab', () => {
    expect(tabPorts.rootPortsInTab(asPorts([a, b]), 3)).toEqual([]);
    expect(tabPorts.rootPortsInTab(asPorts([a, b]), undefined)).toEqual([]);
  });
});

describe('background.ts routes iframe work to the tab that asked', () => {
  let connect: (port: FakePort) => void = () => {};
  const ACTIVE_TAB = 2;

  beforeAll(async () => {
    const noop = {addListener: () => {}};

    (globalThis as unknown as {chrome: unknown}).chrome = {
      runtime: {
        onMessage: noop,
        onInstalled: noop,
        onConnect: {addListener: (l: (p: FakePort) => void) => { connect = l; }},
      },
      contextMenus: {create: () => {}, onClicked: noop},
      tabs: {query: async () => [{id: ACTIVE_TAB}]},
    };

    await import('../../js/background');
  });

  afterAll(() => {
    delete (globalThis as unknown as {chrome?: unknown}).chrome;
  });

  // background.ts may route asynchronously (sendToOneContentPage awaits
  // chrome.tabs.query), so give it a moment before looking.
  const settle = () => new Promise(r => setTimeout(r, 10));

  test('start_iframe_worker goes to the requesting tab, not the active one', async () => {
    // The user started a scrape in tab 1, then switched to tab 2.
    const asker = new FakePort('azad_inject:10', 1, 'https://www.amazon.com/a');
    const active = new FakePort('azad_inject:11', ACTIVE_TAB, 'https://www.amazon.com/b');
    connect(asker);
    connect(active);

    asker.send({
      action: 'fetch_url',
      guid: '0b5f3c1e-7d2a-4c3b-9e8f-1a2b3c4d5e6f',
      url: 'https://www.amazon.com/your-orders/orders?startIndex=10',
      purpose: 'test',
    });

    await settle();
    expect(asker.actions()).toEqual(['start_iframe_worker']);
    expect(active.actions()).toEqual([]);
  });

  test('transactions go to the tab whose worker scraped them', async () => {
    const root = new FakePort('azad_inject:20', 5, 'https://www.amazon.com/c');
    const active = new FakePort('azad_inject:21', ACTIVE_TAB, 'https://www.amazon.com/d');
    const worker = new FakePort(
      'azad_iframe_worker:22', 5, 'https://www.amazon.com/cpe/yourpayments/transactions');

    connect(root);
    connect(active);
    connect(worker);

    worker.send({action: 'transactions', transactions: [], client: 'test'});

    await settle();
    expect(root.actions()).toEqual(['transactions']);
    expect(active.actions()).not.toContain('transactions');
  });
});

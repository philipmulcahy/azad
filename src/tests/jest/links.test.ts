/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as jsdom from 'jsdom';
import * as table_config from '../../js/table_config';
import * as util from '../../js/util';

const EVIL_TITLE = 'Phone case <img src=x onerror="alert(document.cookie)">';

function makeDocument(): Document {
  return new jsdom.JSDOM('<html><body></body></html>').window.document;
}

// Put the HTML into a cell, the way table_config does.
function render(html: string): HTMLElement {
  const td = makeDocument().createElement('td');
  td.innerHTML = html;
  return td;
}

describe('safe_new_tab_link', () => {
  test('a plain link is unchanged', () => {
    expect(util.safe_new_tab_link('https://www.amazon.com/dp/B000', 'Kettle'))
      .toEqual('<a href="https://www.amazon.com/dp/B000" target="_blank" ' +
               'rel="noopener noreferrer">Kettle</a>');
  });

  test('the title is text, not markup', () => {
    const td = render(util.safe_new_tab_link('https://www.amazon.com/dp/B000', EVIL_TITLE));
    expect(td.querySelector('img')).toBeNull();
    expect(td.querySelectorAll('a').length).toEqual(1);
    expect(td.textContent).toEqual(EVIL_TITLE);
  });

  test('the url cannot break out of its attribute', () => {
    const url = 'https://www.amazon.com/dp/B000" onmouseover="alert(1)';
    const a = render(util.safe_new_tab_link(url, 'x')).querySelector('a')!;
    expect(a.getAttribute('onmouseover')).toBeNull();
    expect(a.getAttribute('href')).toEqual(url);
  });

  test('ampersands survive the round trip', () => {
    const url = 'https://www.amazon.com/gp/your-account/order-details?orderID=1&ref=x';
    const a = render(util.safe_new_tab_link(url, 'Tom & Jerry')).querySelector('a')!;
    expect(a.getAttribute('href')).toEqual(url);
    expect(a.textContent).toEqual('Tom & Jerry');
  });

  test.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ])('%j becomes "#"', (url: string) => {
    expect(util.isSafeLinkUrl(url)).toBe(false);
    const a = render(util.safe_new_tab_link(url, 'x')).querySelector('a')!;
    expect(a.getAttribute('href')).toEqual('#');
  });

  test('a missing url or title gives a harmless link, not an exception', () => {
    // e.g. a shipment with no tracking link, or a field missing from an
    // older cache entry.
    const a = render(
      util.safe_new_tab_link(undefined, null)).querySelector('a')!;

    expect(a.getAttribute('href')).toEqual('#');
    expect(a.textContent).toEqual('');
    expect(util.escapeHtml(undefined)).toEqual('');
  });

  test.each([
    'https://www.amazon.co.uk/dp/B000',
    'http://www.amazon.com/dp/B000',
    '/gp/your-account/order-details?orderID=1',
    'gp/product/B000',
  ])('%j is allowed', (url: string) => {
    expect(util.isSafeLinkUrl(url)).toBe(true);
  });
});

describe('items table description cell', () => {
  type Stubbable = {window?: unknown, chrome?: unknown};
  const g = globalThis as unknown as Stubbable;

  beforeAll(() => {
    g.chrome = {
      storage: {
        sync: {
          get: (_key: string, callback: (entries: object) => void) => callback({}),
        },
      },
    };
    g.window = {location: {href: 'https://www.amazon.com/your-orders/orders'}};
  });

  afterAll(() => {
    delete g.chrome;
    delete g.window;
  });

  test('a hostile item title is shown as text', async () => {
    const cols = await table_config.getCols('items');
    const description = cols.find(c => c.field_name == 'description')!;
    const td = makeDocument().createElement('td');

    const item = {
      description: EVIL_TITLE,
      url: 'https://www.amazon.com/dp/B000',
    };

    await description.render_func!(item as never, td);

    expect(td.querySelector('img')).toBeNull();
    expect(td.textContent).toEqual(EVIL_TITLE);
  });
});

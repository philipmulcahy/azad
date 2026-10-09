/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as table_config from '../../js/table_config';

// getCols reads the site from window.location and column visibility from
// chrome.storage.sync: stub just enough of both.
type Stubbable = {
  window?: unknown,
  chrome?: unknown,
};

const g = globalThis as unknown as Stubbable;

beforeAll(() => {
  g.chrome = {
    storage: {
      sync: {
        get: (_key: string, callback: (entries: object) => void) => callback({}),
      },
    },
  };
});

afterAll(() => {
  delete g.chrome;
});

async function columnNames(tableType: string, site: string): Promise<string[]> {
  g.window = {location: {href: `https://${site}/your-orders/orders`}};

  try {
    const cols = await table_config.getCols(tableType);
    return cols.map(c => c.field_name);
  } finally {
    delete g.window;
  }
}

describe('subscribe & save column', () => {
  test.each([
    'www.amazon.com',
    'www.amazon.ca',
    'www.amazon.co.uk',
  ])('orders table shows it on %s', async (site: string) => {
    expect(await columnNames('orders', site)).toContain('subscribe & save');
  });

  test.each([
    'www.amazon.de',
    'www.amazon.fr',
    'www.amazon.com.au',
    'www.amazon.com.mx',
    'www.amazon.co.jp',
    'www.amazon.in',
  ])('orders table does not show it on %s', async (site: string) => {
    expect(await columnNames('orders', site)).not.toContain('subscribe & save');
  });

  test.each([
    'www.amazon.com',
    'www.amazon.ca',
    'www.amazon.co.uk',
  ])('items table never shows it (items have no such field): %s',
    async (site: string) => {
      const names = await columnNames('items', site);
      expect(names).toContain('price');  // the stub works
      expect(names).not.toContain('subscribe & save');
    }
  );
});

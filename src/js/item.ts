/* Copyright(c) 2017-2021 Philip Mulcahy. */

import * as azad_entity from './entity';
import * as extraction from './extraction';
import * as fsa_hsa from './fsa_hsa';
import * as order_header from './order_header';
import * as request_scheduler from './request_scheduler';
import * as req from './request';
import * as settings from './settings';
import * as strategy from './strategy';
import * as urls from './url';
import * as util from './util';

export interface IItem extends azad_entity.IEntity {
  description: string;
  price: string;
  quantity: number;
  url: string;
  asin: string;
  order_header: order_header.IOrderHeader;
  category: string;
  fsa_hsa_eligible?: string;  // 'Yes' when Amazon explicitly marks the product
}

// A scrape's table mode determines whether product pages are needed.
const productLookupModes = new WeakMap<request_scheduler.IRequestScheduler, string>();
const productInfoPromises = new WeakMap<
  request_scheduler.IRequestScheduler, Map<string, Promise<ProductInfo>>
>();

export function configureProductLookup(
  scheduler: request_scheduler.IRequestScheduler,
  tableType: string,
): void {
  productLookupModes.set(scheduler, tableType);
}

type ItemsExtractor = (
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string,
) => IItem[];

function extract_asin_from_url(url: string): string {
  const patterns = [
    /\/gp\/product\/([A-Za-z0-9]+)/,
    /\/dp\/([A-Za-z0-9]+)/,
  ];
  const results = patterns.map(p => p.exec(url));
  const filtered_matches = results.filter(r => r);
  try {
    return filtered_matches![0]![1];
  } catch (ex) {
    console.error(ex);
  }
  return '';
}

export function extractItems(
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  scheduler: request_scheduler.IRequestScheduler,
  context: string,
): Promise<IItem[]> {
  const bareStrategies: ItemsExtractor[] = [
    strategy0,
    strategy1,
    strategy2,
    strategy3,
    strategy4,
    strategy5,
  ];

  const strategies = bareStrategies.map(
    s => () => s(order_elem, order_header, context + ';extractItems'));

  const items = strategy.firstMatchingStrategy(
    'extractItems', strategies, []);

  return categoriseItems(items, scheduler);
}

async function categoriseItems(
  items: IItem[],
  scheduler: request_scheduler.IRequestScheduler,
): Promise<IItem[]> {
  const mode = productLookupModes.get(scheduler);
  const usesItemColumns = mode === 'items' || mode === 'fsa_items';
  // When no mode is configured (e.g. diagnostics), retain historical behavior.
  const needFsa = mode === undefined || mode === 'fsa_orders' ||
    usesItemColumns;
  let needCategory = mode === undefined || usesItemColumns;

  if (needCategory) {
    try {
      needCategory = await settings.getBoolean('show_category_in_items_view');
    } catch (ex) {
      console.log('Could not read category setting:', ex);
    }
  }
  // Orders and shipments need neither product categories nor item labels.
  // This avoids extra product requests during ordinary order exports.
  const completions = items.map(async (item: IItem): Promise<void> => {
    item.fsa_hsa_eligible = '';
    const is_us_item = /(^|\.)amazon\.com$/i.test(item.order_header.site);
    if (!needCategory && (!needFsa || !is_us_item)) return;
    if (!item.url || !/^https?:\/\//i.test(item.url)) return;
    try {
      const result = await getProductInfo(item.url, scheduler);
      if (needCategory) item.category = result.category;
      if (needFsa && is_us_item && result.fsa_hsa_eligible) {
        item.fsa_hsa_eligible = 'Yes';
      }
    } catch (ex) {
      console.debug('getProductInfo failed for item', util.stringifyError(ex));
    }
  });
  await Promise.allSettled(completions);
  return items;
}

interface ProductInfo {
  category: string;
  fsa_hsa_eligible: boolean;
}

function getProductInfo(
  product_url: string,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<ProductInfo> {
  let requests = productInfoPromises.get(scheduler);
  if (!requests) {
    requests = new Map<string, Promise<ProductInfo>>();
    productInfoPromises.set(scheduler, requests);
  }
  const existing = requests.get(product_url);
  if (existing) return existing;
  const promise = fetchProductInfo(product_url, scheduler);
  requests.set(product_url, promise);
  // Allow a later attempt when the request fails; keep successes for reuse.
  void promise.catch(() => {
    if (requests?.get(product_url) === promise) requests.delete(product_url);
  });
  return promise;
}

function fetchProductInfo(
  product_url: string,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<ProductInfo> {
  return req.makeAsyncStaticRequest<ProductInfo>(
    product_url,
    'getProductInfo',
    (evt) => {
      const doc = util.parseStringToDOM(evt.target.responseText);
      const category = extraction.by_regex(
        'item_category',
        ['//*[@id="wayfinding-breadcrumbs_feature_div"]//ul'],
        null,
        '',
        doc.documentElement,
        'category'
      );
      return {
        category: (category || '').replace(/\s+/g, ' ').trim(),
        fsa_hsa_eligible: fsa_hsa.product_fsa_hsa_eligible(doc),
      };
    },
    scheduler,
    '00000',  // priority
    false,  // cached response is acceptable
    'category',
  );
}

function strategy0(
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string
): IItem[] {
  const item_xpath = './/div[' +
    'contains(@class, "fixed-left-grid-inner") and ' +
    './/a[contains(@href, "/gp/product/")] and ' +
    './/*[contains(@class, "price")]' +
    ']';
  const itemElems: Node[] = extraction.findMultipleNodeValues(
    item_xpath,
    order_elem
  );
  const items: IItem[] = <IItem[]>itemElems.map(itemElem => {
    const link = <HTMLElement>extraction.findSingleNodeValue(
      './/a[@class="a-link-normal" and contains(@href, "/gp/product/") and not(img)]',
      <HTMLElement>itemElem,
      context,
    );
    const description = util.defaulted(link.textContent, '').trim();
    const url = util.defaulted(link.getAttribute('href'), '').trim();
    let qty: number = 0;
    try {
      qty = parseInt(
        util.defaulted(
          extraction.findSingleNodeValue(
            './/span[@class="item-view-qty"]',
            <HTMLElement>itemElem,
            context,
          ).textContent,
          '1'
        ).trim()
      );
    } catch (ex) {
      qty = 1;
      if (!String(ex).includes('match')) {
        console.log(ex);
      }
    }
    let price = '';
    try {
      const priceElem = <HTMLElement>extraction.findSingleNodeValue(
        './/*[contains(@class, "price")]',
        <HTMLElement>itemElem,
        context,
      );
      price = util.defaulted(priceElem.textContent, '').trim();
    } catch (ex) {
      console.warn('could not find price for: ' + description);
    }
    const asin = extract_asin_from_url(url);
    return {
      description: description,
      order_header: order_header,
      price: price,
      quantity: qty,
      url: urls.normalizeUrl(url, urls.getSite()),
      asin: asin,
      category: '',
    };
  });
  return items;
}

// Digital orders.
function strategy1(
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string,
): IItem[] {
  const itemElems: Node[] = extraction.findMultipleNodeValues(
    '//*[contains(text(), "Ordered") or contains(text(), "Commandé")]/parent::*/parent::*/parent::*',
    order_elem
  );
  const items: IItem[] = <IItem[]>itemElems.map(itemElem => {
    const link = <HTMLElement>extraction.findSingleNodeValue(
      './/a[contains(@href, "/dp/")]',
      <HTMLElement>itemElem,
      context,
    );
    const description = util.defaulted(link.textContent, '').trim();
    const url = util.defaulted(link.getAttribute('href'), '').trim();
    const qty_match = link.parentNode
      ?.parentNode
      ?.textContent
      ?.match(/Qty: (\d+)/);
    const sqty = qty_match ? qty_match[1] : '1';
    const qty = parseInt(sqty);
    const price_match = link.parentNode
      ?.parentNode
      ?.nextSibling
      ?.nextSibling
      ?.textContent
      ?.match(util.moneyRegEx());
    const price = price_match ? price_match[1] : '';
    const asin = extract_asin_from_url(url);
    return {
      description: description,
      order_header: order_header,
      price: price,
      quantity: qty,
      url: urls.normalizeUrl(url, urls.getSite()),
      asin: asin,
      category: '',
    };
  });
  return items;
}

// TODO  Add logging/counting of how frequently each strategy "wins",
// TODO  and then prune/merge/improve.

// Amazon.com 2016
function strategy2(
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string,
): IItem[] {
  const itemElems: Node[] = extraction.findMultipleNodeValues(
    '//div[contains(@id, "orderDetails")]//a[contains(@href, "/product/")]/parent::*',
    order_elem
  );
  const items: IItem[] = <IItem[]>itemElems.map(itemElem => {
    const link = <HTMLElement>extraction.findSingleNodeValue(
      './/a[contains(@href, "/product/")]',
      <HTMLElement>itemElem,
      context,
    );
    const description = util.defaulted(link.textContent, '').trim();
    const url = util.defaulted(link.getAttribute('href'), '').trim();
    const qty_match = link.parentNode
      ?.parentNode
      ?.textContent
      ?.match(/Qty: (\d+)/);
    const sqty = qty_match ? qty_match[1] : '1';
    const qty = parseInt(sqty);
    const price_match = link.parentNode
      ?.parentNode
      ?.nextSibling
      ?.nextSibling
      ?.textContent
      ?.match(util.moneyRegEx());
    const price = price_match ? price_match[1] : '';
    const asin = extract_asin_from_url(url);
    return {
      description: description,
      order_header: order_header,
      price: price,
      quantity: qty,
      url: urls.normalizeUrl(url, urls.getSite()),
      asin: asin,
      category: '',
    };
  });
  return items.filter(item => item.description != '');
}

// This strategy works for Amazon.com grocery orders in 2021.
function strategy3(
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string,
): IItem[] {
  const itemElems: Node[] = extraction.findMultipleNodeValues(
    '//div[contains(@class, "a-section")]//span[contains(@id, "item-total-price")]/parent::div/parent::div/parent::div',
    order_elem
  );
  const items: IItem[] = <IItem[]>itemElems.map(itemElem => {
    const link = <HTMLElement>extraction.findSingleNodeValue(
      './/a[contains(@class, "a-link-normal") and contains(@href, "/product/")]',
      <HTMLElement>itemElem,
      context,
    );
    const description = util.defaulted(link.textContent, '').trim();
    const url = util.defaulted(link.getAttribute('href'), '').trim();
    const sqty = (link.parentNode as HTMLElement)
      ?.nextElementSibling
      ?.textContent
      ?.trim() ?? "1";
    const qty = parseInt(sqty);
    if (isNaN(qty)) {
      throw 'strategy3: non-numeric quantity';
    }
    let price = '';
    try {
      const priceElem = <HTMLElement>extraction.findSingleNodeValue(
        './/span[contains(@id, "item-total-price")]',
        <HTMLElement>itemElem,
        context,
      );
      price = util.defaulted(priceElem.textContent, '').trim();
    } catch (ex) {
      console.warn('could not find price for: ' + description);
    }
    const asin = extract_asin_from_url(url);
    return {
      description: description,
      order_header: order_header,
      price: price,
      quantity: qty,
      url: urls.normalizeUrl(url, urls.getSite()),
      asin: asin,
      category: '',
    };
  });
  return items;
}

// This strategy is aimed at physical orders whose items stopped parsing in
// September 2024 for all previous strategies.
function strategy4(
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string
): IItem[] {
  const item_xpath = './/div/div[contains(@data-component, "itemTitle")]/..';
  const itemElems: Node[] = extraction.findMultipleNodeValues(
    item_xpath,
    order_elem
  );
  const items: IItem[] = <IItem[]>itemElems.map(itemElem => {
    const link = <HTMLElement>extraction.findSingleNodeValue(
      './/div[@data-component="itemTitle"]//a',
      <HTMLElement>itemElem,
      context,
    );
    const description = util.defaulted(link.textContent, '').trim();
    const url = util.defaulted(link.getAttribute('href'), '').trim();
    let qty: number = 0;
    try {
      qty = parseInt(
        util.defaulted(
          extraction.findSingleNodeValue(
            '../..//div[@class="od-item-view-qty"]/span',
            <HTMLElement>itemElem,
            context,
          ).textContent,
          '1'
        ).trim()
      );
    } catch (ex) {
      qty = 1;
      if (!String(ex).includes('match')) {
        console.log(ex);
      }
    }
    let price = '';
    try {
      const priceElem = <HTMLElement>extraction.findSingleNodeValue(
        './/div[@data-component="unitPrice"]//span[not(span)]',
        <HTMLElement>itemElem,
        context,
      );
      price = util.defaulted(priceElem.textContent, '').trim();
    } catch (ex) {
      console.warn('could not find price for: ' + description);
    }
    const asin = extract_asin_from_url(url);
    return {
      description: description,
      order_header: order_header,
      price: price,
      quantity: qty,
      url: urls.normalizeUrl(url, urls.getSite()),
      asin: asin,
      category: '',
    };
  });
  return items;
}

// Digital subscription orders, such as Disney+
// from 2025-01
function strategy5(
  order_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string
): IItem[] {
  const itemHeaders: Node[] = extraction.findMultipleNodeValues(
    '//div[@id="digitalOrderSummaryContainer"]//tr//td//b[contains(text(), "Ordered")]/parent::*/parent::*',
    order_elem,
    context,
  );

  if (itemHeaders.length != 1) {
    throw 'not looking like a digital order';
  }

  const itemsHeader = itemHeaders[0] as HTMLElement;
  const firstItemRow = itemsHeader.nextElementSibling as HTMLElement;

  const itemCells = extraction.findMultipleNodeValues(
    './/td',
    firstItemRow,
    context + ' item',
  ) as HTMLElement[];

  const lines = itemCells[0].innerHTML.split('<br>').map(
    html => {
      html = html.trim();
      const e = order_elem.ownerDocument.createElement('div') as HTMLElement;
      e.innerHTML = html;
      return e.textContent;
    }
  );

  const description = lines[0];
  const _seller = lines[1];
  const quantity = +(lines[2]!);
  const price = itemCells[1]?.textContent?.trim();
  const url = urls.normalizeUrl(
    `/gp/digital/your-account/order-summary.html?orderID=${order_header.id}`,
    urls.getSite()
  );

  const items: IItem[] = [
    {
      description,
      order_header,
      price,
      quantity,
      url,
      asin: '',
      category: '',
    } as IItem,
  ];

  return items;
}

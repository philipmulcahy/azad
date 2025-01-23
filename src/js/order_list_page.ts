/* Copyright(c) 2023 Philip Mulcahy. */

import * as order_header from './order_header';
import * as dom2json from './dom2json';
import * as extraction from './extraction';
import * as notice from './notice';
import * as req from './request';
import * as request_scheduler from './request_scheduler';
import * as sprintf from 'sprintf-js';
import * as urls from './url';
import * as util from './util';

export interface IOrdersPageData {
  expected_order_count: number;
  order_headers: order_header.IOrderHeader[];
}

async function get_page_data(
  site: string,
  year: number,
  start_order_number: number, // zero based
  template: string,
  scheduling_priority: string,
  scheduler: request_scheduler.IRequestScheduler,
  nocache_top_level: boolean,
): Promise<IOrdersPageData>
{
  const nocache: boolean = (start_order_number==0) ? true : nocache_top_level;
  const url = generateQueryString(site, year, start_order_number, template);
  return req.makeAsyncRequest<IOrdersPageData>(
    url, 
    evt => translateOrdersPage(evt, year.toString()),
    scheduler,
    scheduling_priority,
    nocache,
    'order_list_page.get_page_data: ' + start_order_number,  // debug_context
  );
}


async function get_expected_order_count(
  site: string,
  year: number,
  template: string,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<number>
{
  const page_data = await get_page_data(
    site,
    year,
    0,  // first order; therefore first page
    template,
    '00000',  // want this to happen ASAP
    scheduler,
    true,
  );
  return page_data.expected_order_count;
}

async function get_page_of_headers(
  site: string,
  year: number,
  template: string,
  start_order_number: number, // zero based
  scheduler: request_scheduler.IRequestScheduler,
  nocache_top_level: boolean,
): Promise<order_header.IOrderHeader[]>
{
  const page_data = await get_page_data(
    site,
    year,
    start_order_number,
    template,
    '2',  // want headers before details, but after order count
    scheduler,
    nocache_top_level,
  );
  return page_data.order_headers;
}

export async function get_headers(
  site: string,
  year: number,
  scheduler: request_scheduler.IRequestScheduler,
  nocache_top_level: boolean,
): Promise<order_header.IOrderHeader[]>
{
  async function fetch_headers_for_template(template: string)
    : Promise<order_header.IOrderHeader[]>
  {
    const expected_order_count = await get_expected_order_count(
      site, year, template, scheduler);
    const header_promises: Promise<order_header.IOrderHeader[]>[] = [];
    for(let iorder = 0; iorder < expected_order_count; iorder += 10) {
      console.log(
        'creating header page request for order: ' + iorder + ' onwards'
      );
      const page_of_headers = get_page_of_headers(
        site, year, template, iorder, scheduler, nocache_top_level
      );
      header_promises.push(page_of_headers);
    }
    const pages_of_headers = await util.get_settled_and_discard_rejects(header_promises);
    const headers = pages_of_headers.flat();
    if (headers.length != expected_order_count) {
      console.error(
        'expected ', expected_order_count, ' orders, but only found ',
        headers.length);
    }
    return headers;
  }
  const templates = selectTemplates(site);
  const headerPromises = await templates.map(fetch_headers_for_template);
  const headerss = await util.get_settled_and_discard_rejects(headerPromises);
  const headers = dedupe(headerss.flat());

  // TODO remove this function if/when we remove alternates per site for
  // templates.
  function dedupe(
    headers: order_header.IOrderHeader[]
  ): order_header.IOrderHeader[] {
    // Only one header per order ID, picking the most populated when there is
    // more than one.
    function estimateSize(header: order_header.IOrderHeader): number {
      return JSON.stringify(header).length;
    }

    // Sorted in declining size order.
    const sorted = headers.sort((a,b) => estimateSize(b) - estimateSize(a));
    const hmap = new Map<string, order_header.IOrderHeader>();
    sorted.forEach(h => hmap.set(h.id, h));
    return Array.from(hmap.values());
  }

  return headers;
}

const BASE_URL_TEMPLATE = 'https://%(site)s/your-orders/orders?' + [
  // '?ie=UTF8' +
  'timeFilter=year-%(year)s',
  'startIndex=%(startOrderPos)s'
].join('&');

// https://www.amazon.co.uk/gp/css/order-history?timeFilter=year-2025&startIndex=0

const TEMPLATES_BY_SITE: Record<string, string[]> = {
  'www.amazon.co.jp': [BASE_URL_TEMPLATE],
  'www.amazon.co.uk': [BASE_URL_TEMPLATE],
  // 'www.amazon.co.uk': ['https://%(site)s/gp/css/order-history' +
  //     '?opt=ab&digitalOrders=1' +
  //     '&unifiedOrders=1' +
  //     '&returnTo=' +
  //     '&orderFilter=year-%(year)s' +
  //     '&startIndex=%(startOrderPos)s'],
  'www.amazon.com.au': [BASE_URL_TEMPLATE],
  'www.amazon.de': [BASE_URL_TEMPLATE + '&language=en_GB'],
  'www.amazon.es': [BASE_URL_TEMPLATE + '&language=en_GB'],
  'www.amazon.in': [BASE_URL_TEMPLATE + '&language=en_GB'],
  'www.amazon.it': [BASE_URL_TEMPLATE + '&language=en_GB'],
  'www.amazon.ca': [BASE_URL_TEMPLATE + '&language=en_US'],
  'www.amazon.fr': [BASE_URL_TEMPLATE + '&language=en_GB'],
  'www.amazon.com': [BASE_URL_TEMPLATE + '&language=en_US'],
  'www.amazon.com.mx': [BASE_URL_TEMPLATE + '&language=en_US'],
  'other': [BASE_URL_TEMPLATE + '&language=en_US'],
};

function selectTemplates(site: string): string[] {
  let templates: string[] = TEMPLATES_BY_SITE[site];
  if ( !templates ) {
    templates = TEMPLATES_BY_SITE['other'];
    notice.showNotificationBar(
      'Your site is not fully supported.\n' +
      'For better support, click on the popup where it says\n' +
      '"CLICK HERE if you get incorrect results!",\n' +
      'provide diagnostic information, and help me help you.',
      document
    );
  }
  return templates;
}

function generateQueryString(
  site: string,
  year: number,
  startOrderPos: number,
  template: string,
) {
  return sprintf.sprintf(
    template,
    {
      site: site,
      year: year,
      startOrderPos: startOrderPos
    }
  );
}

function translateOrdersPage(
  evt: any,
  period: string,  // log description of the period we are fetching orders for.
): IOrdersPageData {
  try {
    const opd = reallyTranslateOrdersPage(evt, period);
    return opd;
  } catch (ex) {
    console.error('translateOrdersPage caught ', ex);
    throw ex;
  }
}

function reallyTranslateOrdersPage(
  evt: any,
  period: string,  // log description of the period we are fetching orders for.
): IOrdersPageData {
  const d = util.parseStringToDOM(evt.target.responseText);
  const context = 'Converting orders page';
  const countSpan = extraction.findSingleNodeValue(
    './/span[@class="num-orders"]', d.documentElement, context);
  if ( !countSpan ) {
    const msg = 'Error: cannot find order count elem in: '
    + evt.target.responseText;
    console.error(msg);
    throw(msg);
  }
  const textContent = countSpan.textContent;
  const splits = textContent!.split(' ');
  if (splits.length == 0) {
    const msg = 'Error: not enough parts';
    console.error(msg);
    throw(msg);
  }
  const expected_order_count: number = parseInt( splits[0], 10 );
  console.log(
    'Found ' + expected_order_count + ' orders for ' + period
  );
  if(isNaN(expected_order_count)) {
    console.warn(
      'Error: cannot find order count in ' + countSpan.textContent
    );
  }
  let ordersElem;
  try {
    // ordersElem = d.getElementById('ordersContainer');
    ordersElem = extraction.findSingleNodeValue(
      '//div[contains(@class, "your-orders-content-container")]',
      d.documentElement,
      'finding order list container') as HTMLElement;
  } catch(err) {
    const msg = 'Error: maybe you\'re not logged into ' +
                'https://' + urls.getSite() + '/gp/css/order-history ' +
                err;
    console.warn(msg);
    throw msg;
  }
  const order_elems: HTMLElement[] = extraction.findMultipleNodeValues(
    './/*[contains(concat(" ", normalize-space(@class), " "), " js-order-card ")]',
    ordersElem
  ).map( node => <HTMLElement>node );
  const serialized_order_elems = order_elems.map(
      elem => dom2json.toJSON(elem, getCachedAttributeNames())
  );
  if ( !serialized_order_elems.length ) {
    console.error(
      'no order elements in converted order list page: ' +
      evt.target.responseURL
    );
  }
  const headers = order_elems.map(
    elem => order_header.extractOrderHeader(elem, evt.target.responseURL));
  const converted = {
    expected_order_count: expected_order_count,
    order_headers: headers, 
  };
  if (typeof(converted) == 'undefined') {
    console.error('we got a blank one!');
  }
  return converted;
}

function getCachedAttributeNames() {
  return new Set<string>(['class', 'href', 'id', 'style']);
}

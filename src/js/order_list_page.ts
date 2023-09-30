/* Copyright(c) 2023 Philip Mulcahy. */

import * as order_header from './order_header';
import * as dom2json from './dom2json';
import * as notice from './notice';
import * as request_scheduler from './request_scheduler';
import * as sprintf from 'sprintf-js';
import * as urls from './url';
import * as util from './util';

export interface IOrdersPageData {
  expected_order_count: number;
  order_headers: order_header.IOrderHeader[];
};

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
    const response = await scheduler.scheduleToPromise<IOrdersPageData>(
        url, 
        evt => translateOrdersPage(evt, year.toString()),
        scheduling_priority,
        nocache,
        'order_list_page.get_page_data: ' + start_order_number,  // debug_context
    );
    return response.result;
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
};

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
};

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
        'sending request for order: ' + iorder + ' onwards'
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
  };
  const templates = selectTemplates(site);
  const headerss = await util.get_settled_and_discard_rejects(await templates.map(fetch_headers_for_template));
  const headers = headerss.flat();
  return headers;
}

const TEMPLATES_BY_SITE: Record<string, string[]> = {
  'www.amazon.co.jp': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s'],
  'www.amazon.co.uk': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s'],
 'www.amazon.com.au': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s'],
  'www.amazon.de': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_GB'],
  'www.amazon.es': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_GB'],
  'www.amazon.in': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_GB'],
  'www.amazon.it': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_GB'],
  'www.amazon.ca': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s'],
  'www.amazon.fr': ['https://%(site)s/gp/css/order-history' +
      '?opt=ab&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&returnTo=' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s'],
  'www.amazon.com': [
      'https://%(site)s/gp/css/order-history' +
      '?opt=ab' +
      '&ie=UTF8' +
      '&digitalOrders=1' +
      '&unifiedOrders=0' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_US',

      'https://%(site)s/gp/css/order-history' +
      '?opt=ab' +
      '&ie=UTF8' +
      '&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_US'],
  'www.amazon.com.mx': [
      'https://%(site)s/gp/your-account/order-history/ref=oh_aui_menu_date' +
      '?ie=UTF8' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s',

      'https://%(site)s/gp/your-account/order-history/ref=oh_aui_menu_yo_new_digital' +
      '?ie=UTF8' +
      '&digitalOrders=1' +
      '&orderFilter=year-%(year)s' +
      '&unifiedOrders=0' +
      '&startIndex=%(startOrderPos)s'],
  'other': [
      'https://%(site)s/gp/css/order-history' +
      '?opt=ab' +
      '&ie=UTF8' +
      '&digitalOrders=1' +
      '&unifiedOrders=0' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_GB',

      'https://%(site)s/gp/css/order-history' +
      '?opt=ab' +
      '&ie=UTF8' +
      '&digitalOrders=1' +
      '&unifiedOrders=1' +
      '&orderFilter=year-%(year)s' +
      '&startIndex=%(startOrderPos)s' +
      '&language=en_GB'],
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
  return templates.map(t => t + '&disableCsd=no-js');
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
};

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
  const countSpan = util.findSingleNodeValue(
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
      ordersElem = d.getElementById('ordersContainer');
  } catch(err) {
    const msg = 'Error: maybe you\'re not logged into ' +
                'https://' + urls.getSite() + '/gp/css/order-history ' +
                err;
    console.warn(msg)
    throw msg;
  }
  const order_elems: HTMLElement[] = util.findMultipleNodeValues(
    './/*[contains(concat(" ", normalize-space(@class), " "), " order ")]',
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
  }
  if (typeof(converted) == 'undefined') {
    console.error('we got a blank one!');
  }
  return converted;
};

function getCachedAttributeNames() {
  return new Set<string>(['class', 'href', 'id', 'style']);
}


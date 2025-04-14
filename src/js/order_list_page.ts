/* Copyright(c) 2023 Philip Mulcahy. */

import * as business from './business';
import * as dom2json from './dom2json';
import * as extraction from './extraction';
import * as iframeWorker from './iframe-worker';
import * as notice from './notice';
import * as order_header from './order_header';
import * as req from './request';
import * as request from './request';
import * as request_scheduler from './request_scheduler';
import * as sprintf from 'sprintf-js';
import * as urls from './url';
import * as util from './util';

type headerPageUrlGenerator = (
  site: string, year: number, startOrderIndex: number) => Promise<string>;

async function getExpectedOrderCount(
  site: string,
  year: number,
  urlGenerator: headerPageUrlGenerator,
): Promise<number> {
  const url = await urlGenerator(site, year, 0);
  const pageReadyXpath = '//span[@class="num-orders"]';
  const response = await iframeWorker.fetchURL(url, pageReadyXpath);
  const d = util.parseStringToDOM(response.html);
  const context = 'getExpectedOrderCount';

  const countSpan = extraction.findSingleNodeValue(
    '//span[@class="num-orders"]', d.documentElement, context);

  if ( !countSpan ) {
    const msg = 'Error: cannot find order count elem in: ' + response.html;
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
    'Found ' + expected_order_count + ' orders for ' + year.toString()
  );

  if(isNaN(expected_order_count)) {
    console.warn(
      'Error: cannot find order count in ' + countSpan.textContent
    );
  }

  return expected_order_count;
}

async function get_page_of_headers(
  site: string,
  year: number,
  urlGenerator: headerPageUrlGenerator,
  start_order_number: number, // zero based
  scheduler: request_scheduler.IRequestScheduler,
): Promise<order_header.IOrderHeader[]> {
  const url = await urlGenerator(site, year, start_order_number);
  const pageReadyXpath = '//*[contains(@class, "yohtmlc-order-id")]';
  const nocache = start_order_number == 0;
  const priority = nocache ? '00000' : '2';

  const pageData = request.makeAsyncDynamicRequest(
    url,
    'get_page_of_headers',
    (evt) => translateOrdersPage(evt, year.toString()),
    pageReadyXpath,
    scheduler,
    '',
    nocache,
    'order_list_page.get_page_of_headers: ' + start_order_number,  // debug_context
  );

  return pageData;
}

function dedupeHeaders(headers: order_header.IOrderHeader[]): order_header.IOrderHeader[] {
  const deduped: order_header.IOrderHeader[] = [];
  const seen = new Set<string>();

  for (const h of headers) {
    if (seen.has(h.id)) {
      continue;
    }

    seen.add(h.id);
    deduped.push(h);
  }

  return deduped;
}

export async function get_headers(
  site: string,
  year: number,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<order_header.IOrderHeader[]> {
  async function fetch_headers_for_template(
    urlGenerator: headerPageUrlGenerator
  ) : Promise<order_header.IOrderHeader[]> {
    const expected_order_count = await getExpectedOrderCount(
      site, year, urlGenerator);

    const header_promises: Promise<order_header.IOrderHeader[]>[] = [];

    for(let iorder = 0; iorder < expected_order_count; iorder += 10) {
      console.log(
        'creating header page request for order: ' + iorder + ' onwards'
      );

      const page_of_headers = get_page_of_headers(
        site, year, urlGenerator, iorder, scheduler,
      );

      header_promises.push(page_of_headers);
    }

    const pages_of_headers = await util.get_settled_and_discard_rejects(
      header_promises);

    const headers = pages_of_headers.flat();

    if (headers.length != expected_order_count) {
      console.error(
        'expected ', expected_order_count, ' orders, but only found ',
        headers.length);
    }

    return dedupeHeaders(headers);
  }

  const isBusinessAcct: boolean = await business.isBusinessAccount();

  const urlGenerator: headerPageUrlGenerator = isBusinessAcct ?
    business.getOrderHeadersSequencePageURL :
    function(site, year, index) {
      const template = selectTemplate(site);
      const url = generateQueryString(site, year, index, template);
      return Promise.resolve(url);
    }

  const headers = await fetch_headers_for_template(urlGenerator);
  return headers;
}

const BASE_URL_TEMPLATE = 'https://%(site)s/your-orders/orders?' + [
  // '?ie=UTF8' +
  'timeFilter=year-%(year)s',
  'startIndex=%(startOrderPos)s'
].join('&');

// https://www.amazon.co.uk/gp/css/order-history?timeFilter=year-2025&startIndex=0

const TEMPLATE_BY_SITE: Map<string, string> = new Map<string, string>([
  ['www.amazon.co.jp', BASE_URL_TEMPLATE],
  ['www.amazon.co.uk', BASE_URL_TEMPLATE],
  ['www.amazon.com.au', BASE_URL_TEMPLATE],
  ['www.amazon.de', BASE_URL_TEMPLATE + '&language=en_GB'],
  ['www.amazon.es', BASE_URL_TEMPLATE + '&language=en_GB'],
  ['www.amazon.in', BASE_URL_TEMPLATE + '&language=en_GB'],
  ['www.amazon.it', BASE_URL_TEMPLATE + '&language=en_GB'],
  ['www.amazon.ca', BASE_URL_TEMPLATE + '&language=en_US'],
  ['www.amazon.fr', BASE_URL_TEMPLATE + '&language=en_GB'],
  ['www.amazon.com', BASE_URL_TEMPLATE + '&language=en_US'],
  ['www.amazon.com.mx', BASE_URL_TEMPLATE + '&language=en_US'],
  ['other', BASE_URL_TEMPLATE + '&language=en_US'],
]);

function selectTemplate(site: string): string {
  if (TEMPLATE_BY_SITE.has(site)) {
    return TEMPLATE_BY_SITE.get(site)!;
  } else {
    return TEMPLATE_BY_SITE.get('other')!;
  }
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
      startOrderPos: startOrderPos,
    }
  );
}

function translateOrdersPage(
  evt: any,
  period: string,  // log description of the period we are fetching orders for.
): order_header.IOrderHeader[] {
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
): order_header.IOrderHeader[] {
  const d = util.parseStringToDOM(evt.target.responseText);

  let ordersElem;

  try {
    ordersElem = extraction.findSingleNodeValue(
      '//div[contains(@class, "your-orders-content-container") '
      + 'or @id="ordersContainer" '
      + 'or @id="yourOrderInfoSection"]',
      d.documentElement,
      'finding order list container for:' + period
    ) as HTMLElement;
  } catch(err) {
    const msg = 'Error: maybe you\'re not logged into ' +
                'https://' + urls.getSite() + '/gp/css/order-history ' +
                err;

    console.warn(msg);
    throw msg;
  }

  const order_elems: HTMLElement[] = extraction.findMultipleNodeValues(
    './/*['
    + 'contains(concat(" ", normalize-space(@class), " "), " js-order-card ") '  // 2025 consumer accounts.
    + 'or @id="orderCard"'  // 2025 business accounts (Amazon seems relaxed about id uniqueness).
    + ']',
    ordersElem,
  ).map( node => <HTMLElement>node );

  const serialized_order_elems = order_elems.map(
      elem => dom2json.toJSON(elem, getCachedAttributeNames())

  );

  if ( !serialized_order_elems.length ) {
    console.error(
      'no order elements in converted order list page for ' + period + ': ' +
      evt.target.responseURL
    );
  }

  const headers = order_elems.map(
    elem => order_header.extractOrderHeader(elem, evt.target.responseURL));

  return headers;
}

function getCachedAttributeNames() {
  return new Set<string>(['class', 'href', 'id', 'style']);
}

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
import * as statistics from './statistics';
import * as urls from './url';
import * as util from './util';

export interface AttributedUrl{
  template: string;
  url: string;
};

type headerPageUrlGenerator = (
  site: string,
  year: number,
  startOrderIndex: number,
) => Promise<AttributedUrl>;

async function getExpectedOrderCount(
  site: string,
  year: number,
  urlGenerator: headerPageUrlGenerator,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<number> {
  const aUrl = await urlGenerator(site, year, 0);
  const url = aUrl.url;
  const pageReadyXpath = '//span[@class="num-orders"]';

  const response = await iframeWorker.fetchURL(
    url, pageReadyXpath,
    'get expected order count',
    scheduler,
  );

  const doc = util.parseStringToDOM(response.html);

  const expectedOrderCount = getExpectedOrderCountFromHeaderDoc(
    doc, response.url);

  return expectedOrderCount;
}

function getExpectedOrderCountFromHeaderDoc(
  doc: HTMLDocument,
  url: string,  // for logging only
): number {
  const context = 'getExpectedOrderCount';

  const countSpan = extraction.findSingleNodeValue(
    '//span[@class="num-orders"]', doc.documentElement, context);

  if ( !countSpan ) {
    const msg = `Error: cannot find order count elem in: ${url}`;
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

  const expectedOrderCount: number = parseInt(splits[0], 10);

  console.log(
    `Found ${expectedOrderCount} orders in ${url}`
  );

  if(isNaN(expectedOrderCount)) {
    console.warn(
      'Error: cannot find order count in ' + countSpan.textContent
    );
  }

  return expectedOrderCount;
}

async function get_page_of_headers(
  site: string,
  year: number,
  urlGenerator: headerPageUrlGenerator,
  start_order_number: number, // zero based
  scheduler: request_scheduler.IRequestScheduler,
  updateExpectedOrderCount: (count: number)=>void,
): Promise<OrderHeaderPageData> {
  const aUrl = await urlGenerator(site, year, start_order_number);
  const url = aUrl.url;
  const urlTemplate = aUrl.template;
  const pageReadyXpath = '//*[contains(@class, "yohtmlc-order-id")]';
  const nocache = start_order_number == 0;
  const priority = nocache ? '00000' : '2';

  const pdp = request.makeAsyncDynamicRequest(
    url,
    'get_page_of_headers',
    (evt) => translateOrdersPage(evt, year.toString()),
    pageReadyXpath,
    scheduler,
    '',  // priority
    nocache,
    `order_list_page.get_page_of_headers: ${start_order_number}`,  // context
  ) as Promise<OrderHeaderPageData>;

  try {
    const pageData = await pdp;
    updateExpectedOrderCount(pageData.expectedOrderCount);
    const headers = pageData.headers;
    const ids: string[] = headers.map(h => h.id);
    const idCount: number = ids.length;
    if (idCount > 0) {
      statistics.UrlStats.reportSuccess(urlTemplate, idCount);
    } else {
      statistics.UrlStats.reportFailure(urlTemplate);
    }

    console.debug(
      `get_page_of_headers fetched ${url} and discovered these ids: ${ids.join(', ')}`);

    return pageData;
  } catch (err) {
    console.warn(
      `get_page_of_headers blew up while fetching or processing: ${err}`)

    throw err;
  }
}

function dedupeHeaders(
  headers: order_header.IOrderHeader[]
): order_header.IOrderHeader[] {
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

export async function getHeaders(
  site: string,
  year: number,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<order_header.IOrderHeader[]> {
  async function fetchHeadersForTemplate(
    urlGenerator: headerPageUrlGenerator
  ): Promise<order_header.IOrderHeader[]> {
    let expected_order_count = await getExpectedOrderCount(
      site, year, urlGenerator, scheduler);

    console.log(`setting expected order count to ${expected_order_count}`);

    function updateExpectedOrderCount(count: number): void {
      if (count > expected_order_count) {
        console.log(
          'updating expected order count ' +
          `from ${expected_order_count} to ${count}`);

        expected_order_count = count;
      }
    }

    const headerPromises: Promise<OrderHeaderPageData>[] = [];

    function notEnoughPagesRequested(): boolean {
      const expectedPageCount = Math.floor((expected_order_count-1)/10)+1;
      return headerPromises.length < expectedPageCount;
    }

    for(let iorder = 0; notEnoughPagesRequested(); iorder += 10) {
      console.log(
        'creating header page request for order: ' + iorder + ' onwards'
      );

      const headersPageData = get_page_of_headers(
        site, year, urlGenerator, iorder, scheduler, updateExpectedOrderCount,
      );

      headerPromises.push(headersPageData);
    }

    const pages = await util.get_settled_and_discard_rejects(headerPromises);
    const headers = pages.map(data => data.headers).flat();

    if (headers.length != expected_order_count) {
      console.error(
        `expected ${expected_order_count} orders, ` +
        `but got ${headers.length}`
      );
    }

    return headers;
  }

  const isBusinessAcct: boolean = await business.isBusinessAccount(scheduler);

  const urlGenerators: headerPageUrlGenerator[] = isBusinessAcct ?
    [business.getOrderHeadersSequencePageURL] :
    selectTemplates(site).map(
      template => function(site, year, index) {
        const url = generateQueryString(site, year, index, template);
        return Promise.resolve({template, url});
      }
    );

  const pheaderss = urlGenerators.map(ug => fetchHeadersForTemplate(ug));
  const headerss = await util.get_settled_and_discard_rejects(pheaderss);
  const headers = headerss.flat();
  const deduped = dedupeHeaders(headers);
  const filtered = deduped.filter(oh => oh.date?.getFullYear() == year);
  return filtered;
}

const BASE_URL_TEMPLATE = 'https://%(site)s/your-orders/orders?' + [
  'timeFilter=year-%(year)s',
  'startIndex=%(startOrderPos)s'
].join('&');

const BASE_DIGITAL_URL_TEMPLATE_0 = 'https://%(site)s/gp/legacy/order-history?' + [
  'opt=ab',
  'orderFilter=year-%(year)s',
  'startIndex=%(startOrderPos)s',
  'unifiedOrders=0',
  'digitalOrders=1',
  '_encoding=UTF8',
  'returnTo=',
].join('&');

const BASE_DIGITAL_URL_TEMPLATE_1 = BASE_URL_TEMPLATE +
  '&orderFilter=digital';

const TEMPLATE_BY_SITE: Map<string, string[]> = new Map<string, string[]>([
  ['www.amazon.ca', [BASE_URL_TEMPLATE + '&language=en_US']],
  ['www.amazon.co.jp', [BASE_URL_TEMPLATE]],
  ['www.amazon.co.uk', [BASE_URL_TEMPLATE]],
  ['www.amazon.com',
    [
      BASE_URL_TEMPLATE + '&language=en_US',
      BASE_DIGITAL_URL_TEMPLATE_0 + '&language=en_US',
      BASE_DIGITAL_URL_TEMPLATE_1 + '&language=en_US',
    ],
  ],
  ['www.amazon.com.au', [BASE_URL_TEMPLATE]],
  ['www.amazon.com.mx', [BASE_URL_TEMPLATE + '&language=en_US']],
  ['www.amazon.de', [BASE_URL_TEMPLATE + '&language=en_GB']],
  ['www.amazon.es', [BASE_URL_TEMPLATE + '&language=en_GB']],
  ['www.amazon.fr', [BASE_URL_TEMPLATE + '&language=en_GB']],
  ['www.amazon.in', [BASE_URL_TEMPLATE + '&language=en_GB']],
  ['www.amazon.it', [BASE_URL_TEMPLATE + '&language=en_GB']],
  ['other', [BASE_URL_TEMPLATE + '&language=en_US']],
]);

function selectTemplates(site: string): string[] {
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

type OrderHeaderPageData = {
  headers: order_header.IOrderHeader[],
  expectedOrderCount: number,
};

function translateOrdersPage(
  evt: any,
  period: string,  // log description of the period we are fetching orders for.
): OrderHeaderPageData {
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
): OrderHeaderPageData {
  const doc = util.parseStringToDOM(evt.target.responseText);
  const expectedOrderCount = getExpectedOrderCountFromHeaderDoc(doc, evt.target.url);
  let ordersElem;

  try {
    ordersElem = extraction.findSingleNodeValue(
      '//div[contains(@class, "your-orders-content-container") '
      + 'or @id="ordersContainer" '
      + 'or @id="yourOrderInfoSection"]',
      doc.documentElement,
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

  return {
    headers,
    expectedOrderCount,
  };
}

function getCachedAttributeNames() {
  return new Set<string>(['class', 'href', 'id', 'style']);
}

/* Copyright(c) 2023 Philip Mulcahy. */

import * as business from './business';
import * as dom2json from './dom2json';
import * as extraction from './extraction';
import * as order_header from './order_header';
import * as request from './request';
import * as request_scheduler from './request_scheduler';
import * as sprintf from 'sprintf-js';
import * as statistics from './statistics';
import * as urls from './url';
import * as util from './util';
import * as xpaths from './xpaths';
export interface AttributedUrl{
  template: string;
  url: string;
}

type headerPageUrlGenerator = (
  site: string,
  year: number,
  startOrderIndex: number,
) => Promise<AttributedUrl>;

async function get_page_of_headers(
  site: string,
  year: number,
  urlGenerator: headerPageUrlGenerator,
  start_order_number: number, // zero based
  scheduler: request_scheduler.IRequestScheduler,
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
    priority,
    nocache,
    `order_list_page.get_page_of_headers: ${start_order_number}`,  // context
  ) as Promise<OrderHeaderPageData>;

  try {
    const pageData = await pdp;
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
      `get_page_of_headers blew up while fetching or processing: ${err}`);

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
    const headerPromises: Promise<OrderHeaderPageData>[] = [];

    // Without num-orders (previously conveniently embedded in html by Amazon)
    // to tell us when to stop, we need to detect when to stop
    // Assumption: pagination goes in date order
    // Algorithm:
    // 1. Kick off MAX_CONCURRENT paginations so that we can take advantage of
    // parallelization.
    // 2. When a pagination comes back with zero results, we know we've gone
    //    past the filter, so we don't have to start up any more paginations.
    //    Optional speed up:  Right now, we let dangling paginations bleed out
    //         but we could stop them proactively.  I (nebosite@) didn't think
    //         it was worth the added complexity to do that.
    let nextOrderIndex = 0;
    let shouldStopPagination = false;
    const MAX_CONCURRENT = 4;

    // Create initial batch of requests
    function createMoreRequests(): void {
      while (headerPromises.length < MAX_CONCURRENT && !shouldStopPagination) {
        console.log(
          `creating header page request for order: ${nextOrderIndex} onwards`
        );

        const headersPageData = get_page_of_headers(
          site, year, urlGenerator, nextOrderIndex, scheduler,
        );

        headerPromises.push(headersPageData);
        nextOrderIndex += 10;
      }
    }

    // Start with initial batch
    createMoreRequests();

    const pages = await util.get_settled_and_discard_rejects(headerPromises);

    // Check if any page came back empty - if so, we've hit the end
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (page && page.headers && page.headers.length === 0) {
        shouldStopPagination = true;
        break;
      }
    }

    const headers = pages.map(data => data?.headers || []).flat();
    return headers;
  }

  // Catch errors from fetchHeadersForTemplate
  async function safelyFetchHeadersForTemplate(
    urlGenerator: headerPageUrlGenerator
  ): Promise<order_header.IOrderHeader[]> {
    try {
      return await fetchHeadersForTemplate(urlGenerator);
    } catch (ex) {
      console.error('[ERROR] fetchHeadersForTemplate threw:', ex);
      return [];
    }
  }

  const isBusinessAcct: boolean = await business.isBusinessAccount();

  const urlGenerators: headerPageUrlGenerator[] = isBusinessAcct ?
    [business.getOrderHeadersSequencePageURL] :
    selectTemplates(site).map(
      template => function(site, year, index) {
        const url = generateQueryString(site, year, index, template);
        return Promise.resolve({template, url});
      }
    );

  const pheaderss = urlGenerators.map(ug => safelyFetchHeadersForTemplate(ug));
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
};

function translateOrdersPage(
  evt: request.AzadResponseEvent,
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
  evt: request.AzadResponseEvent,
  period: string,  // log description of the period we are fetching orders for.
): OrderHeaderPageData {
  const xhr = evt.target as XMLHttpRequest;
  const doc = util.parseStringToDOM(xhr.responseText);
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
    xpaths.order_card_xpath,
    ordersElem,
  ).map( node => <HTMLElement>node );

  const serialized_order_elems = order_elems.map(
      elem => dom2json.toJSON(elem, getCachedAttributeNames())

  );

  if ( !serialized_order_elems.length ) {
    console.error(
      'no order elements in converted order list page for ' + period + ': ' +
      xhr.responseURL
    );
  }

  const headers = order_elems.map(
    elem => order_header.extractOrderHeader(elem, xhr.responseURL));

  return {
    headers,
  };
}

function getCachedAttributeNames() {
  return new Set<string>(['class', 'href', 'id', 'style']);
}

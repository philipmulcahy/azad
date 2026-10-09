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

// Older years' list pages are cached, but not for ever: orders get archived,
// and Amazon re-renders its lists.
export const LIST_PAGE_CACHE_MAX_AGE_MILLIS = 7 * 24 * 60 * 60 * 1000;

export type ListPageCachePolicy = {
  nocache: boolean,
  maxAgeMillis: number,
};

/*
 * Whether a page of order headers may come from (and go to) the cache.
 * Pages for a year that is still filling up change between scrapes: new
 * orders push older ones onto later pages. So they are always fetched
 * afresh, as are first pages (as before). "Still filling up" means any year
 * that includes a day in the last month, which covers late orders from
 * 31 December during January.
 */
export function listPageCachePolicy(
  year: number,
  startOrderIndex: number,
  now: Date = new Date(),
): ListPageCachePolicy {
  const aMonthAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const recent = year >= aMonthAgo.getFullYear();

  return {
    nocache: startOrderIndex == 0 || recent,
    maxAgeMillis: LIST_PAGE_CACHE_MAX_AGE_MILLIS,
  };
}

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
  const cachePolicy = listPageCachePolicy(year, start_order_number);
  const priority = start_order_number == 0 ? '00000' : '2';

  const pdp = request.makeAsyncDynamicRequest(
    url,
    'get_page_of_headers',
    (evt) => translateOrdersPage(evt, year.toString()),
    pageReadyXpath,
    scheduler,
    priority,
    cachePolicy.nocache,
    `order_list_page.get_page_of_headers: ${start_order_number}`,  // context
    {
      maxAgeMillis: cachePolicy.maxAgeMillis,
      // A page with no order cards may just be one that didn't render in
      // time: don't let it stand in for the real page on later scrapes.
      shouldCache: (pageData: OrderHeaderPageData) =>
        pageData.headers.length > 0,
    },
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

export type PageFetcher = (startOrderIndex: number) =>
  Promise<OrderHeaderPageData>;

export type PaginationOptions = {
  batchSize: number,  // pages fetched in parallel
  pageSize: number,  // orders per page
  retryDelayMillis: number,  // wait before a second try
};

export type PaginationResult = {
  headers: order_header.IOrderHeader[],
  failedPageIndices: number[],  // startOrderIndex of each page we couldn't get

  // If we gave up before the list ended (a whole batch failed): the
  // startOrderIndex of the first page we didn't get from there on, beyond
  // which we don't know how many orders there are. null if the list ended.
  truncatedAt: number | null,
};

const DEFAULT_PAGINATION: PaginationOptions = {
  batchSize: 4,
  pageSize: 10,
  retryDelayMillis: 3000,
};

/*
 * Fetch an order list page by page until it ends.
 *
 * Without num-orders (previously conveniently embedded in html by Amazon)
 * to tell us when to stop, we need to detect when to stop.
 * Assumption: pagination goes in date order.
 * We fetch batchSize pages at a time, in parallel, and the list ends at the
 * first empty page with no orders after it. But a page can also come back
 * empty, or fail, just because it didn't load or render in time, and taking
 * that for the end of the list, or dropping it, loses orders (#360). So:
 * - a page that fails is tried once more, after retryDelayMillis;
 * - an empty page with non-empty pages after it in its batch is tried again;
 * - so is the empty page that looks like the end, before we believe it.
 * Pages we still couldn't get are listed in failedPageIndices, so that the
 * caller can tell the user their table may be incomplete. If a whole batch
 * fails we stop, and say where in truncatedAt: the orders after that point
 * are missing too, however many there are.
 */
export async function fetchAllPages(
  fetchPage: PageFetcher,
  options: Partial<PaginationOptions> = {},
): Promise<PaginationResult> {
  const opts: PaginationOptions = {...DEFAULT_PAGINATION, ...options};
  const headers: order_header.IOrderHeader[] = [];
  const failedPageIndices: number[] = [];
  let truncatedAt: number | null = null;

  const pause = () => new Promise(r => setTimeout(r, opts.retryDelayMillis));

  // undefined if the page failed.
  async function tryOnce(
    index: number,
  ): Promise<OrderHeaderPageData | undefined> {
    try {
      return await fetchPage(index);
    } catch (ex) {
      console.warn(`order list page from order ${index} failed: ${ex}`);
      return undefined;
    }
  }

  async function tryAgain(
    index: number,
  ): Promise<OrderHeaderPageData | undefined> {
    await pause();
    console.log(`order list page from order ${index}: trying again`);
    return tryOnce(index);
  }

  const hasOrders = (p: OrderHeaderPageData | undefined) =>
    p !== undefined && p.headers.length > 0;

  let nextOrderIndex = 0;

  for (;;) {
    const indices: number[] = [];

    for (let i = 0; i < opts.batchSize; i++) {
      console.log(
        `creating header page request for order: ${nextOrderIndex} onwards`
      );

      indices.push(nextOrderIndex);
      nextOrderIndex += opts.pageSize;
    }

    const pages = await Promise.all(
      indices.map(async index => (await tryOnce(index)) ?? tryAgain(index))
    );

    const lastWithOrders = pages.map(hasOrders).lastIndexOf(true);
    let ended = false;

    for (let i = 0; i < pages.length && !ended; i++) {
      const index = indices[i];
      let page = pages[i];

      if (page === undefined) {
        failedPageIndices.push(index);
        continue;
      }

      if (!hasOrders(page)) {
        page = await tryAgain(index);

        if (!hasOrders(page)) {
          if (i < lastWithOrders) {
            // Orders come after it, so it isn't the end: we've lost it.
            failedPageIndices.push(index);
          } else {
            ended = true;
          }

          continue;
        }
      }

      headers.push(...page!.headers);
    }

    if (ended) {
      break;
    }

    if (pages.every(p => p === undefined)) {
      // Nothing is getting through: give up rather than go on for ever.
      truncatedAt = indices[0];

      console.warn(
        `giving up on order list at order ${truncatedAt}, after ` +
        `${failedPageIndices.length} failed pages`);

      break;
    }
  }

  return {headers, failedPageIndices, truncatedAt};
}

// Up to 10 orders are missing for each page we couldn't get: say so, in the
// console and in the scrape statistics the popup shows.
function reportFailedPages(
  year: number,
  results: PaginationResult[],
  scheduler: request_scheduler.IRequestScheduler,
): void {
  const failed = results.flatMap(r => r.failedPageIndices);

  const truncations = results
    .map(r => r.truncatedAt)
    .filter((t): t is number => t !== null);

  if (failed.length == 0 && truncations.length == 0) {
    return;
  }

  if (truncations.length) {
    console.warn(
      `the ${year} order list was cut short (at order ` +
      `${truncations.join(', ')}) because nothing more could be fetched: ` +
      'all the orders after that point are missing, however many there are.'
    );
  }

  if (failed.length) {
    console.warn(
      `${failed.length} page(s) of the ${year} order list could not be ` +
      `fetched (starting at orders ${failed.join(', ')}): ` +
      `${failed.length * 10} or fewer orders are missing from them.`
    );
  }

  for (let i = 0; i < failed.length; i++) {
    scheduler.stats().increment(statistics.OStatsKey.LIST_PAGE_FAILURE_COUNT);
  }
}

export async function getHeaders(
  site: string,
  year: number,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<order_header.IOrderHeader[]> {
  async function fetchHeadersForTemplate(
    urlGenerator: headerPageUrlGenerator
  ): Promise<PaginationResult> {
    return fetchAllPages(
      index => get_page_of_headers(
        site, year, urlGenerator, index, scheduler),
    );
  }

  // Catch errors from fetchHeadersForTemplate
  async function safelyFetchHeadersForTemplate(
    urlGenerator: headerPageUrlGenerator
  ): Promise<PaginationResult> {
    try {
      return await fetchHeadersForTemplate(urlGenerator);
    } catch (ex) {
      console.error('[ERROR] fetchHeadersForTemplate threw:', ex);
      return {headers: [], failedPageIndices: [], truncatedAt: 0};
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

  const presults = urlGenerators.map(ug => safelyFetchHeadersForTemplate(ug));
  const results = await util.get_settled_and_discard_rejects(presults);
  reportFailedPages(year, results, scheduler);
  const headers = results.flatMap(r => r.headers);
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

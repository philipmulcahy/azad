/* Copyright(c) 2025 onwards: Philip Mulcahy. */

///////////////////////////////////////////////////////////////////////////////
//
// Stuff to tackle "Business" accounts (first addressed in 2025).
//
///////////////////////////////////////////////////////////////////////////////

import * as extraction from './extraction';
import * as iframeWorker from './iframe-worker';
import * as order_list_page from './order_list_page';
import * as urls from './url';
import * as util from './util';

let _isBusinessAccount: boolean|null = null;

/**
 * If this returns false, you have no need of any of the other functions in
 * this module.
 * @returns true if the account that doc
 */
export async function isBusinessAccount(): Promise<boolean> {
  if (_isBusinessAccount == null) {
    const doc = await getBaseOrdersPage();

    const hasBusinessAccountPicker = extraction.findMultipleNodeValues(
      '//*[@class="abnav-accountfor"]',
      doc.body,
      'determining if we are scraping a business account',
    ).length != 0;

    const hasBusinessLogo = extraction.findMultipleNodeValues(
      '//*[@aria-label="Amazon Business"]',
      doc.body,
      'determining if we are scraping a business account',
    ).length != 0;

    _isBusinessAccount = hasBusinessAccountPicker || hasBusinessLogo;
  }

  return _isBusinessAccount;
}

/**
 * Builds URL for a page of order headers in an amazon business acocunt.
 * This is complicated by the need to determine a "btbGroupKey".
 * @param year the year that the orders were made in
 * @param startIndex order to start the page with - typically a multiple of 10
 * @returns URL
 */
export async function getOrderHeadersSequencePageURL(
  site: string,
  year: number,
  startIndex: number
): Promise<order_list_page.AttributedUrl> {
  // const btbGroupKey = await getBTBGroupKey();

  // return urls.normalizeUrl(
  //   '/gp/your-account/order-history' +
  //   '?opt=ab' +
  //   `&selectedB2BGroupKey=${btbGroupKey}` +
  //   '&digitalOrders=1' +
  //   '&unifiedOrders=1' +
  //   `&orderFilter=year-${year}` +
  //   `&startIndex=${startIndex}`,
  //   site
  // );

  const pageNumber = (startIndex / 10) + 1;

  // TODO: find a way to avoid repeating the template string - maybe abandon
  //       template literal and go with sprintf (which I use somewhere else
  //       in this project).
  const template = '/gp/css/order-history?ref_=abn_yadd_ad_your_orders#time/${year}/pagination/${pageNumber}/';
  const url = urls.normalizeUrl(
    `/gp/css/order-history?ref_=abn_yadd_ad_your_orders#time/${year}/pagination/${pageNumber}/`,
    site,
  );

  return Promise.resolve({template, url});
}

export function getBaseOrdersPageURL() {
  const site = urls.getSite();
  const url = urls.normalizeUrl('/gp/css/order-history', site);
  return url;
}

// let btbGroupKey: string = '';  // hyper-local cache
// async function getBTBGroupKey(): Promise<string> {
//   function strategy0(doc: HTMLDocument): string {
//     const groupKeyNode = extraction.findSingleNodeValue(
//       BTB_KEY_XPATH_0,
//       doc.documentElement,
//       'getBTBGroupKey#0',
//     ) as HTMLElement;

//     const value = groupKeyNode.getAttribute('value') ?? '';
//     const key = value.replace(/.*-/, '');
//     return key;
//   }

//   function strategy1(doc: HTMLDocument): string {
//     const groupKeyNode = extraction.findSingleNodeValue(
//       BTB_KEY_XPATH_1,
//       doc.documentElement,
//       'getBTBGroupKey#1',
//     ) as HTMLElement;

//     return groupKeyNode.getAttribute('value') ?? '';
//   }

//   function keyFromDocument(doc: HTMLDocument): string {
//     const strategies = [strategy0, strategy1].map( s => () => s(doc) );
//     return extraction.firstMatchingStrategy<string>(
//       'btbGroupKey', strategies, '');
//   }

//   if (btbGroupKey == '') {
//     const doc = await getBaseOrdersPage();
//     btbGroupKey = keyFromDocument(doc);
//   }

//   return btbGroupKey;
// }

const BTB_KEY_XPATH_0 = '//option[contains(@value, "yoAllOrders-")]';
const BTB_KEY_XPATH_1 = '//select[@name="selectedB2BGroupKey"]/option[starts-with(@value, "B2B:")]';
const BTB_KEY_XPATH_2 = '//div[contains(@class, "yohtmlc-order-id")]';
const BTB_KEY_XPATHS = [
  BTB_KEY_XPATH_0,
  BTB_KEY_XPATH_1,
  BTB_KEY_XPATH_2,
].join('|');

async function getBaseOrdersPage(): Promise<HTMLDocument> {
  const baseUrl = getBaseOrdersPageURL();

  const response = await iframeWorker.fetchURL(
    baseUrl, BTB_KEY_XPATHS, 'get base orders page url');

  const html = response.html;
  const doc = util.parseStringToDOM(html);
  return doc;
}

/* Copyright(c) 2025 onwards: Philip Mulcahy. */

///////////////////////////////////////////////////////////////////////////////
//
// Stuff to tackle "Business" accounts (first addressed in 2025).
//
///////////////////////////////////////////////////////////////////////////////

import * as extraction from './extraction';
import * as signin from './signin';
import * as urls from './url';
import * as util from './util';

/**
 * If this returns false, you have no need of any of the other functions in
 * this module.
 * @returns true if the account that doc
 */
export async function isBusinessAccount(): Promise<boolean> {
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

  return hasBusinessAccountPicker || hasBusinessLogo;
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
): Promise<string> {
  const btbGroupKey = await getBTBGroupKey();

  return urls.normalizeUrl(
    '/gp/your-account/order-history' +
    '?opt=ab' +
    `&selectedB2BGroupKey=${btbGroupKey}` +
    '&digitalOrders=1' +
    '&unifiedOrders=1' +
    `&orderFilter=year-${year}` +
    `&startIndex=${startIndex}`,
    site
  );
}

export function getBaseOrdersPageURL() {
  const site = urls.getSite();
  const url = urls.normalizeUrl('/gp/css/order-history', site);
  return url;
}

let btbGroupKey: string = '';  // hyper-local cache
async function getBTBGroupKey(): Promise<string> {
  if (btbGroupKey == '') {
    const doc = await getBaseOrdersPage();

    const groupKeyNode = extraction.findSingleNodeValue(
      '//select[@name="selectedB2BGroupKey"]/option[starts-with(@value, "B2B:")]',
      doc.documentElement,
      'getBTBGroupKey',
    ) as HTMLElement;

    btbGroupKey = groupKeyNode.getAttribute('value') ?? '';
  }
  return btbGroupKey;
}

async function getBaseOrdersPage(): Promise<HTMLDocument> {
  const baseUrl = getBaseOrdersPageURL();
  const response = await signin.checkedFetch(baseUrl);

  if (!response.ok) {
    const msg = 'failed to fetch ' + baseUrl;
    console.warn('msg');
    throw msg;
  }

  const html = await response.text();
  const doc = util.parseStringToDOM(html);
  return doc;
}

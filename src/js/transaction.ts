import * as cacheStuff from './cachestuff';
import * as extraction from './extraction';
import * as iframeWorker from './iframe-worker';
const lzjs = require('lzjs');
import * as transaction from './transaction';
import * as util from './util';

function getCache() {
  return cacheStuff.createLocalCache('TRANSACTIONS');
}

export interface Transaction {
  date: Date,
  cardInfo: string,
  orderIds: string[],
  amount: number,
  vendor: string,
};

export function clearCache() {
  getCache().clear();
}

const CACHE_KEY = 'ALL_TRANSACTIONS';

export async function reallyScrapeAndPublish(
  getPort: () => Promise<chrome.runtime.Port | null>,
  startDate: Date,
  endDate: Date,
) {
  const transactions = await extractAllTransactions();

  const filtered = filterTransactionsByDateRange(
    transactions, startDate, endDate);

  const url = document.URL;
  const port = await getPort();

  try {
    if (port) {
      port.postMessage({
        action: 'transactions',
        transactions: filtered,
        url: url,
      });
    }
  } catch (ex) {
    console.warn(ex);
  }
}

function filterTransactionsByDateRange(
  transactions: transaction.Transaction[],
  start: Date,
  end: Date,
): transaction.Transaction[] {
  const url = document.URL;
  const paramString = url.split('?')[1];
  return transactions.filter(t => t.date >= start && t.date <= end);
}

function extractPageOfTransactions(): transaction.Transaction[] {
  const dateElems: Element[] = extraction.findMultipleNodeValues(
    '//div[contains(@class, "transaction-date-container")]',
    document.documentElement,
    'transaction date extraction',
  ) as Element[];

  return dateElems.map(de => extractTransactionsWithDate(de)).flat();
}

async function retryingExtractPageOfTransactions(): Promise<transaction.Transaction[]> {
  let elapsedMillis: number = 0;
  const DEADLINE_MILLIS = 10 * 1000;
  const INCREMENT_MILLIS = 1000;

  while (elapsedMillis <= DEADLINE_MILLIS) {
    console.log('waiting', INCREMENT_MILLIS);
    await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
    elapsedMillis += INCREMENT_MILLIS;
    console.log('elapsedMillis', elapsedMillis);
    const page = extractPageOfTransactions();
    console.log(`got ${page.length} transactions`);

    if (page.length == 20) {
      console.log(`returning ${page.length} transactions`);
      return page;
    } else if (page.length > 0) {
      // Wait before trying one final time
      // in case amazon code was still running when we sampled.
      console.log(`waiting (once) before scraping one last time`);
      await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
      const finalTry = extractPageOfTransactions();
      console.log(`got ${finalTry.length} transactions`);
      return finalTry;
    }
  };

  return [];
}

function extractTransactionsWithDate(
  dateElem: Element
): transaction.Transaction[] {
  const dateString = util.defaulted(dateElem.textContent, '1970-01-01');
  const date = new Date(dateString);
  const transactionElemContainer = dateElem.nextElementSibling;

  const transactionElems: HTMLElement[] = extraction.findMultipleNodeValues(
    './/div[contains(@class, "transactions-line-item")]',
    transactionElemContainer as HTMLElement,
    'finding transaction elements') as HTMLElement[];

  return transactionElems
    .map(te => extractSingleTransaction(date, te))
    .filter(t => t) as transaction.Transaction[];
}

function extractSingleTransaction(
  date: Date,
  elem: Element,
): transaction.Transaction | null {
  const children = extraction.findMultipleNodeValues(
    './div',
    elem as HTMLElement,
    'transaction components') as HTMLElement[];

  const cardAndAmount = children[0];

  const orderIdElems = children
    .slice(1)
    .filter(oie => oie.textContent?.match(util.orderIdRegExp()));

  const vendorElems = children
    .slice(1)
    .filter(oie => !oie.textContent?.match(util.orderIdRegExp()));

  const vendor = vendorElems.length
    ? (vendorElems.at(-1)?.textContent?.trim() ?? '??')
    : '??';

  const orderIds: string[] = orderIdElems.map(
    oe => util.defaulted(
      extraction.by_regex(
        ['.//a[contains(@href, "order")]'],
        new RegExp('.*([A-Z0-9]{3}-\\d+-\\d+).*'),
        '??',
        oe,
        'transaction order id',
      ),
      '??',
    )
  );

  const amountSpan = extraction.findMultipleNodeValues(
    './/span',
    cardAndAmount,
    'amount span'
  )[1] as HTMLElement;

  const amountText = amountSpan.textContent ?? '0';
  const amountMatch = amountText.match(util.moneyRegEx());
  const amount: number = amountMatch ? +amountMatch[3] : 0;

  const cardInfo = util.defaulted(
    extraction.by_regex(
      ['.//span'],
      new RegExp('(.*\\*{4}.*)'),
      '??',
      cardAndAmount,
      'transaction amount',
    ),
    '??',
  );

  const transaction = {
    date,
    orderIds,
    cardInfo,
    amount,
    vendor,
  };

  console.debug('extractSingleTransaction returning', transaction);

  return transaction;
}

function mergeTransactions(
  a: transaction.Transaction[],
  b: transaction.Transaction[]
): transaction.Transaction[] {
  // Q: Why are you not using map on Set.values() iterator?
  // A? YCM linting thinks it's not a thing, along with a bunch of other
  //    sensible iterator magic. Chrome is fine with it, but my life is too
  //    short, and in the typical use case the copy won't be too expensive.
  const merged = new Set<string>([a, b].flat().map(t => JSON.stringify(t)));
  const ss = Array.from(merged.values());

  const ts: transaction.Transaction[] = restoreDateObjects(
    ss.map(s => JSON.parse(s)));

  return ts;
}

async function extractAllTransactions() {
  let allKnownTransactions = await getTransactionsFromCache();

  const maxCachedTimestamp = Math.max(
    ...allKnownTransactions.map(t => t.date.getTime()));

  let minNewTimestamp = new Date(3000, 1, 1).getTime();
  let nextButton = findUsableNextButton() as HTMLElement;
  let page: transaction.Transaction[] = [];

  do {
    page = await retryingExtractPageOfTransactions();
    console.log('scraped', page.length, 'transactions');
    minNewTimestamp = Math.min(...allKnownTransactions.map(t => t.date.getTime()));
    allKnownTransactions = mergeTransactions(page, allKnownTransactions);
    nextButton = findUsableNextButton() as HTMLElement;

    if (nextButton) {
      nextButton.click();
    }
  } while(nextButton && page && minNewTimestamp >= maxCachedTimestamp)

  putTransactionsInCache(allKnownTransactions);
  return allKnownTransactions;
}

function findUsableNextButton(): HTMLInputElement | null {
  try {
    const buttonInputElem = extraction.findSingleNodeValue(
      '//span[contains(@class, "button")]/span[text()="Next page"]/preceding-sibling::input[not(@disabled)]',
      document.documentElement,
      'finding transaction elements'
    ) as HTMLInputElement;
    return buttonInputElem;
  } catch(_) {
    return null;
  }
}

function maybeClickNextPage(): void {
  const btn = findUsableNextButton();
  if (btn) {
    console.log('clicking next page button');
    btn.click();
  } else {
    console.log('no next page button found');
  }
}

async function getTransactionsFromCache(): Promise<transaction.Transaction[]> {
  const compressed = await getCache().get(CACHE_KEY);
  if (!compressed) {
    return [];
  }
  const s = lzjs.decompress(compressed);
  const ts = restoreDateObjects(JSON.parse(s));
  return ts;
}

function putTransactionsInCache(ts: transaction.Transaction[]) {
  const s = JSON.stringify(ts);
  const compressed = lzjs.compress(s);
  getCache().set(CACHE_KEY, compressed);
}

function restoreDateObjects(
  ts: transaction.Transaction[]
): transaction.Transaction[] {
  return ts.map( t => {
    const copy = JSON.parse(JSON.stringify(t));
    copy.date = new Date(copy.date);
    return copy;
  });
}

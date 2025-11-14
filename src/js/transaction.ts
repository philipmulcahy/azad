import * as cacheStuff from './cachestuff';
import * as extraction from './extraction';
const lzjs = require('lzjs');
import * as transaction0 from './transaction0';
import * as transaction1 from './transaction1';

function getCache() {
  return cacheStuff.createLocalCache('TRANSACTIONS');
}

export interface Transaction {
  date: Date,
  cardInfo: string,
  orderIds: string[],
  amount: number,
  vendor: string,
}

type TransactionKey = keyof Transaction;

export function getTransactionKeys(): TransactionKey[] {
  return [
      'date',
      'cardInfo',
      'orderIds',
      'amount',
      'vendor'
  ];
}

export function clearCache() {
  getCache().clear();
}

const CACHE_KEY = 'ALL_TRANSACTIONS';

export async function reallyScrapeAndPublish(
  getPort: () => Promise<chrome.runtime.Port | null>,
  startDate: Date,
  endDate: Date,
) {
  const transactions = findUsableNextButton() !== undefined ?
    await extractAllTransactionsWithNextButton() :
    await extractAllTransactionsWithScrolling();

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
  transactions: Transaction[],
  start: Date,
  end: Date,
): Transaction[] {
  const url = document.URL;
  const paramString = url.split('?')[1];
  return transactions.filter(t => t.date >= start && t.date <= end);
}

export function extractPageOfTransactions(
  doc: Document
): Transaction[] {
  const strategies = [transaction0, transaction1].map(
    t => () => t.extractPageOfTransactions(doc));

  return extraction.firstMatchingStrategy(
    'extractPageOfTransactions', strategies, []);
}

async function retryingExtractPageOfTransactions(): Promise<Transaction[]> {
  let elapsedMillis: number = 0;
  const DEADLINE_MILLIS = 10 * 1000;
  const INCREMENT_MILLIS = 1000;

  while (elapsedMillis <= DEADLINE_MILLIS) {
    console.log('waiting', INCREMENT_MILLIS);
    await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
    elapsedMillis += INCREMENT_MILLIS;
    console.log('elapsedMillis', elapsedMillis);
    const page = extractPageOfTransactions(document);
    console.log(`got ${page.length} transactions`);

    if (page.length == 20) {
      console.log(`returning ${page.length} transactions`);
      return page;
    } else if (page.length > 0) {
      // Wait before trying one final time
      // in case amazon code was still running when we sampled.
      console.log(`waiting (once) before scraping one last time`);
      await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
      const finalTry = extractPageOfTransactions(document);
      console.log(`got ${finalTry.length} transactions`);
      return finalTry;
    }
  }

  return [];
}

function mergeTransactions(
  a: Transaction[],
  b: Transaction[]
): Transaction[] {
  // Q: Why are you not using map on Set.values() iterator?
  // A? YCM linting thinks it's not a thing, along with a bunch of other
  //    sensible iterator magic. Chrome is fine with it, but my life is too
  //    short, and in the typical use case the copy won't be too expensive.
  const merged = new Set<string>([a, b].flat().map(t => JSON.stringify(t)));
  const ss = Array.from(merged.values());

  const ts: Transaction[] = restoreDateObjects(
    ss.map(s => JSON.parse(s)));

  return ts;
}

async function extractAllTransactionsWithNextButton(): Promise<Transaction[]> {
  let allKnownTransactions = await getTransactionsFromCache();

  const maxCachedTimestamp = Math.max(
    ...allKnownTransactions.map(t => t.date.getTime()));

  let shouldContinue = true;

  while(shouldContinue) {
    const page = await retryingExtractPageOfTransactions();
    console.log('scraped', page.length, 'transactions');

    const minNewTimestamp = Math.min(
      ...allKnownTransactions.map(t => t.date.getTime())
    );

    allKnownTransactions = mergeTransactions(page, allKnownTransactions);
    const nextButton = findUsableNextButton();
    const nextButtonFound = nextButton !== undefined;
    console.debug(`next page button ${nextButtonFound ? '': 'not '}found`);
    const overlappedWithCache = minNewTimestamp < maxCachedTimestamp
                              && allKnownTransactions.length > 0;

    if (overlappedWithCache) {
      console.debug(
        'fetched transactions time range are overlapped with cache'
      );
    }

    shouldContinue = nextButtonFound &&
      page.length != 0 &&
      !overlappedWithCache;

    if (shouldContinue) {
      console.log('clicking next page button');
      nextButton?.click();
    } else {
      console.log('stopping transaction scrape');
    }
  }

  putTransactionsInCache(allKnownTransactions);
  return allKnownTransactions;
}

async function extractAllTransactionsWithScrolling(): Promise<Transaction[]> {
  // What behaviour are we exploiting?
  // ---------------------------------
  // Scrolling down the transaction list extends the list of transactions
  // at the bottom, and at some point starts pruning transactions from the top.
  //
  // Strategy outline
  // ----------------
  // Scroll the page while hoovering up new transactions using
  // mergeTransactions to avoid duplicates, until either:
  // 1) the merged collection overlaps with the stuff in the cache,
  // or:
  // 2) the merged collection stops growing.
  //    We know it has stopped growing because it has stayed the same size
  //    after two cycles of scrolling.
  //
  // This implies two nested loops - the outer one sends the scroll events
  // and the inner one observes the transactions repeatedly and decides when
  // Amazon's scripts have stopped adding more.

  const cachedTransactions = await getTransactionsFromCache();

  const maxCachedTimestamp = Math.max(
    ...cachedTransactions.map(t => t.date.getTime())
  );

  console.log(`we have ${cachedTransactions.length} transactions in cache`);
  console.log(`maxCachedTimestamp ${maxCachedTimestamp}`);

  // transaction counts from each call to getTransactionsFromPageAfterScroll()
  const counts: number[] = [];

  // latest and greatest take from the page we're on
  let page: Transaction[] = [];

  while(!overlapped()) {
    commandScroll();
    const latestScrape = await getTransactionsFromPage();
    console.log(`latest scrape got ${latestScrape.length} transactions`);
    try {
      const oldestDateInLatestScrape = latestScrape.map(t => t.date).sort()[0];
      console.log(`latest scrape min timestamp ${oldestDateInLatestScrape}`);
    } catch (_) {};
    page = mergeTransactions(page, latestScrape);
    console.log(`accumulated ${page.length} transactions`);
    counts.push(page.length);
  }

  const mergedTransactions = mergeTransactions(page, cachedTransactions);
  putTransactionsInCache(mergedTransactions);
  return mergedTransactions;

  function overlapped(): boolean {
    return page.map(t => t.date.getTime())
               .some(d => d < maxCachedTimestamp);
  }

  // Has scrolling stopped giving us more transactions?
  function theWellIsDry(): boolean {
    if (counts.length <= 1) {
      return false;  // We don't know, because we've not tried hard enough yet.
    }

    return counts.at(-1) == counts.at(-3);  // compare last with third last.
  }

  function commandScroll(): void {
    console.log('scrolling down by one page');

    const elem = findScrollableElem();
    elem?.scrollIntoView();
  }

  function findScrollableElem(): HTMLElement | undefined {
    return (
      [...document.querySelectorAll(
        'a[data-testid="transaction-link"]'
      )].at(-1) as HTMLElement
    ) ?? undefined;
  }

  async function getTransactionsFromPage(): Promise<Transaction[]> {
    let elapsedMillis: number = 0;
    const DEADLINE_MILLIS = 10 * 1000;
    const INCREMENT_MILLIS = 1000;

    while (elapsedMillis <= DEADLINE_MILLIS) {
      console.log('waiting', INCREMENT_MILLIS);
      await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
      elapsedMillis += INCREMENT_MILLIS;
      console.log('elapsedMillis', elapsedMillis);
      const page = extractPageOfTransactions(document);
      console.log(`scraped ${page.length} transactions`);

      if (page.length > 0) {
        // Wait before trying one final time in case amazon code was still
        // running when we sampled.
        console.log(`waiting (once) before scraping one last time`);
        await new Promise(r => setTimeout(r, INCREMENT_MILLIS));
        const finalTry = extractPageOfTransactions(document);
        console.log(`scraped ${finalTry.length} transactions`);
        return finalTry;
      }
    }

    return [];
  }
}

function findUsableNextButton(): HTMLInputElement | undefined {
  try {
    const buttonInputElem = extraction.findSingleNodeValue(
      '//span[contains(@class, "button")]/span[text()="Next page" or text()="Next Page"]/preceding-sibling::input[not(@disabled)]',
      document.documentElement,
      'finding transaction elements'
    ) as HTMLInputElement;
    return buttonInputElem ?? undefined;
  } catch(_) {
    return undefined;
  }
}

async function getTransactionsFromCache(): Promise<Transaction[]> {
  const compressed = await getCache().get(CACHE_KEY);
  if (!compressed) {
    return [];
  }
  const s = lzjs.decompress(compressed);
  const ts = restoreDateObjects(JSON.parse(s));
  return ts;
}

function putTransactionsInCache(ts: Transaction[]) {
  const s = JSON.stringify(ts);
  const compressed = lzjs.compress(s);
  getCache().set(CACHE_KEY, compressed);
}

function restoreDateObjects(
  ts: Transaction[]
): Transaction[] {
  return ts.map( t => {
    const copy = JSON.parse(JSON.stringify(t));
    copy.date = new Date(copy.date);
    return copy;
  });
}

import * as cacheStuff from './cachestuff';
import * as iframe from './transaction_iframe';
import * as parent from './transaction_parent';


export function getCache() {
  return cacheStuff.createLocalCache('TRANSACTIONS');
}

export interface Transaction {
  date: Date,
  cardInfo: string,
  orderIds: string[],
  amount: number,
  vendor: string,
};

export async function initialisePage(
  getPort: ()=>(chrome.runtime.Port | null)
) {
  if (isInIframedTransactionsPage()) {
    iframe.reallyScrapeAndPublish(getPort);
  } else {
    parent.plantButton();
  }
}

export function clearCache() {
  getCache().clear();
}

export function isInIframedTransactionsPage(): boolean {
  const isInIframe = window.self !== window.top;
  const url = document.URL;
  const isInTransactionsPage = url.includes('/transactions');
  return isInIframe && isInTransactionsPage;
}

export function scrapeAndPublish() {
  if (!isInIframedTransactionsPage()) {
    parent.plantIframe();
  }
}

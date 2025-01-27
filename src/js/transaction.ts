import * as cacheStuff from './cachestuff';
import * as iframeWorker from './iframe-worker';
import * as transactionIframe from './transaction_iframe';
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
  getPort: () => Promise<chrome.runtime.Port | null>
) {
  if (iframeWorker.isInIframeWorker()) {
    transactionIframe.reallyScrapeAndPublish(getPort);
  }}

export function clearCache() {
  getCache().clear();
}

export function scrapeAndPublish(startDate: Date, endDate: Date) {
  if (!iframeWorker.isInIframeWorker()) {
    parent.plantIframe(startDate, endDate);
  }
}

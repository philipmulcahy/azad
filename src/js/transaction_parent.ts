import * as urls from './url';
import * as util from './util';

const IFRAME_ID = 'AZAD-TRANSACTION-SCRAPER';

// Should lead to transactions being scraped, merged with existing cached
// transactions and for the whole set being published.
export function plantIframe(startDate: Date, endDate: Date) {

  // Remove existing iframe if one exists.
  let iframe = document.getElementById(IFRAME_ID);
  if (iframe) {
    iframe.remove();
  }

  const start: string = util.dateToDateIsoString(startDate);
  const end: string = util.dateToDateIsoString(endDate);

  const url = urls.normalizeUrl(
    // encode date range in url as a way of passing them into the iframe
    `/cpe/yourpayments/transactions?startDate=${start}&endDate=${end}`,
    urls.getSite()
  );

  iframe = document.createElement('iframe') as HTMLIFrameElement;
  iframe.setAttribute('src', url);
  iframe.setAttribute('id', IFRAME_ID);
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  document.body.insertBefore(iframe, document.body.firstChild);
}

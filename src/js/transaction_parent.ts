const IFRAME_ID = 'AZAD-TRANSACTION-SCRAPER';

// Should lead to transactions being scraped, merged with existing cached
// transactions and for the whole set being published.
export function plantIframe() {

  // Remove existing iframe if one exists.
  let iframe = document.getElementById(IFRAME_ID);
  if (iframe) {
    iframe.remove();
  }

  iframe = document.createElement('iframe') as HTMLIFrameElement;
  iframe.setAttribute('src', 'https://www.amazon.co.uk/cpe/yourpayments/transactions');
  iframe.setAttribute('id', IFRAME_ID);
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  document.body.insertBefore(iframe, document.body.firstChild);
}

import * as extraction from './extraction';

export function initialisePage() {
  if (inIframedTransactionsPage()) {
    extractPageOfTransactions();
  } else {
    plantButton();
  }
}

function plantTransactionsIframe() {
  const iframe = document.createElement('iframe') as HTMLIFrameElement;
  iframe.setAttribute('src', 'https://www.amazon.co.uk/cpe/yourpayments/transactions');
  document.body.insertBefore(iframe, document.body.firstChild);
}

function extractPageOfTransactions() {
  const transactionElems = extraction.findMultipleNodeValues(
    '//div[contains(@class, "apx-transactions-line-item-component-container")]',
    document.documentElement,
    'transaction extraction',
  );
  console.log('transaction elems', transactionElems);
}

function inIframedTransactionsPage(): boolean {
  const inIframe = window.self !== window.top;
  const url = document.URL;
  const inTransactionsPage = url.includes('/transactions');
  return inIframe && inTransactionsPage;
}

function plantButton() {
  const transactionBtn = document.createElement('button');

  document.body.insertBefore(
    transactionBtn, document.body.firstChild
  );

  transactionBtn.setAttribute('type', 'button');
  transactionBtn.setAttribute('style', 'height:50;width:200; background-color:orange');
  transactionBtn.innerText='Get Transactions';

  transactionBtn.addEventListener(
    'click',
    _evt => plantTransactionsIframe()
  );
}

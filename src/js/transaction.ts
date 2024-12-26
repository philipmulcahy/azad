import * as extraction from './extraction';

interface Transaction {
  date: Date,
  orderId: string,
  amount: number,
};

export function initialisePage() {
  if (inIframedTransactionsPage()) {
    const transactions = extractTransactions();
    console.log(transactions);
  } else {
    plantButton();
  }
}

function plantTransactionsIframe() {
  const iframe = document.createElement('iframe') as HTMLIFrameElement;
  iframe.setAttribute('src', 'https://www.amazon.co.uk/cpe/yourpayments/transactions');
  document.body.insertBefore(iframe, document.body.firstChild);
}

async function extractTransactions() {
  const transactions = extractPageOfTransactions();
  let nextButton = findUsableNextButton();
  while(nextButton) {
    nextButton.click();
    await new Promise(r => setTimeout(r, 5000));
    const ts = extractPageOfTransactions();
    console.log('scraped', ts.length, 'transactions');
    transactions.push(...ts);
    nextButton = findUsableNextButton();
  }
  return transactions;
}

function extractSingleTransaction(_elem: Element): Transaction | null {
  return {
    date: new Date(),
    orderId: 'XX-XXXXXXXX-XXXXXXX',
    amount: 9.99,
  };
}

function extractPageOfTransactions(): Transaction[] {
  const transactionElems: Node[] = extraction.findMultipleNodeValues(
    '//div[contains(@class, "apx-transactions-line-item-component-container")]',
    document.documentElement,
    'transaction extraction',
  );

  return transactionElems
    .filter(e => e)
    .map(e => extractSingleTransaction(e as Element))
    .filter(t => t) as Transaction[];
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

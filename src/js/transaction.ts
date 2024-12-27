import * as extraction from './extraction';
import * as util from './util';

interface Transaction {
  date: Date,
  cardInfo: string,
  orderId: string,
  amount: number,
  vendor: string,
};

export async function initialisePage() {
  if (inIframedTransactionsPage()) {
    const transactions = await extractTransactions();
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
  let nextButton: HTMLElement | null = null;
  try {
    nextButton = findUsableNextButton() as HTMLElement;
  } catch(ex) {
    console.warn(ex);
  }
  while(nextButton) {
    nextButton.click();
    await new Promise(r => setTimeout(r, 5000));
    const ts = extractPageOfTransactions();
    console.log('scraped', ts.length, 'transactions');
    transactions.push(...ts);
    nextButton = findUsableNextButton() as HTMLElement;
  }
  return transactions;
}

function extractPageOfTransactions(): Transaction[] {
  const dateElems: Element[] = extraction.findMultipleNodeValues(
    '//div[contains(@class, "transaction-date-container")]',
    document.documentElement,
    'transaction date extraction',
  ) as Element[];

  return dateElems.map(de => extractTransactionsWithDate(de)).flat();
}

function extractTransactionsWithDate(dateElem: Element): Transaction[] {
  const dateString = util.defaulted(dateElem.textContent, '1970-01-01');
  const date = new Date(dateString);
  const transactionElemContainer = dateElem.nextElementSibling;

  const transactionElems: HTMLElement[] = extraction.findMultipleNodeValues(
    './/div[contains(@class, "transactions-line-item")]',
    transactionElemContainer as HTMLElement,
    'finding transaction elements') as HTMLElement[];

  return transactionElems
    .map(te => extractSingleTransaction(date, te))
    .filter(t => t) as Transaction[];
}

function extractSingleTransaction(
  date: Date,
  elem: Element,
): Transaction | null {
  const children = extraction.findMultipleNodeValues(
    './div',
    elem as HTMLElement,
    'transaction components') as HTMLElement[];

  const cardAndAmount = children[0];
  const orderIdElem = children[1];
  const vendorElem = children[2];

  const orderId: string = util.defaulted(
    extraction.by_regex(
      ['.//a[contains(@href, "order")]'],
      new RegExp('.*([A-Z0-9]{3}-\\d+-\\d+).*'),
      '??',
      orderIdElem,
      'transaction order id',
    ),
    '??',
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

  const vendor = util.defaulted(
    vendorElem?.textContent?.trim(),
    '??',
  );

  const transaction = {
    date,
    orderId,
    cardInfo,
    amount,
    vendor,
  };

  console.debug(transaction);

  return transaction;
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

/* Copyright(c) 2025 Philip Mulcahy. */

import * as extraction from './extraction';
import * as transaction from './transaction';
import * as util from './util';

export function extractPageOfTransactions(
  doc: Document
): transaction.Transaction[] {
  const dateElems: Element[] = extraction.findMultipleNodeValues(
    '//div[contains(@class, "transaction-date-container")]',
    doc.documentElement,
    'transaction date extraction',
  ) as Element[];

  return dateElems.map(de => extractTransactionsWithDate(de)).flat();
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
  const unsignedAmount: number = amountMatch ? +amountMatch[3] : 0;
  const isNegative: boolean = amountText.includes('-');
  const amount = isNegative ? -unsignedAmount : unsignedAmount;

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


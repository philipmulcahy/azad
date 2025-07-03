import {extractPageOfTransactions, Transaction} from '../../js/transaction';
import {extractTransactions} from '../../js/transaction2';
import * as fs from 'fs';
import * as dt from '../../js/date';

const jsdom = require('jsdom');


function scrapePageOfTransactionsFromCannedHtml(htmlFilePath: string): Transaction[] {
  const html: string = fs.readFileSync(htmlFilePath, 'utf8');
  const doc = new jsdom.JSDOM(html).window.document;
  return extractPageOfTransactions(doc);
}

describe('can read 20 transactions', () => {
  test(
    'philipmulcahy', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-06-08.html');

      expect(transactions.length).toEqual(20);
  });

  test(
    'DReffects', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/DReffects/2025-06-08.html');

      expect(transactions.length).toEqual(20);
  });

  test(
    'cmulcahy', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html');

      expect(transactions.length).toEqual(20);
  });
});

///////////////////////////////////////////////////////////////////////////////

type Difference = string;

function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size == b.size && [...a].every(value => b.has(value));
}

function compareTransactions(a: Transaction, b: Transaction): Difference[] {
  const differences: Difference[] = [];
  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(a));
  const commonKeys = new Set<string>();

  for (const k of aKeys) {
    commonKeys.add(k);
  }

  for (const k of bKeys) {
    commonKeys.add(k);
  }

  if (!setsAreEqual(aKeys, bKeys)) {
    for (const k of aKeys) {
      if (!bKeys.has(k)) {
        differences.push(`b missing key: ${k}`);
      }
    }

    for (const k of bKeys) {
      if (!aKeys.has(k)) {
        differences.push(`a missing key: ${k}`);
      }
    }
  }

  for (const k of commonKeys) {
    const aVal = JSON.stringify((a as Record<string, any>)[k]);
    const bVal = JSON.stringify((b as Record<string, any>)[k]);

    if (aVal !== bVal) {
      differences.push(`different values for ${k}: ${aVal} vs ${bVal}`);
    }
  }

  return differences;
}

function compareLists(a: Transaction[], b: Transaction[]): Difference[] {
  const differences: Difference[] = [];

  for (const l of a) {
    if (!b.some(r => compareTransactions(l, r).length == 0)) {
      differences.push(`b does not contain ${JSON.stringify(l)}`);
    }
  }

  for (const r of b) {
    if (!a.some(l => compareTransactions(l, r).length == 0)) {
      differences.push(`a does not contain ${JSON.stringify(r)}`);
    }
  }

  return differences;
}

function transactionParsing(pathStem: string): void {
  const htmlPath = pathStem + '.html';
  const jsonPath = pathStem + '.expected.json';
  const html: string = fs.readFileSync(htmlPath, 'utf8');
  const doc: Document = new jsdom.JSDOM(html).window.document;

  const expected = JSON.parse(
    fs.readFileSync(jsonPath, 'utf8')) as Transaction[];

  expected.forEach(t => t.date = new Date(t.date));
  const transactions = extractTransactions(doc);
  const differences = compareLists(transactions, expected);
  console.log(`differences: ${JSON.stringify(differences)}`);
  expect(differences.length).toEqual(0);
}

test(
  'transaction page graph experiment amazon.de',
  () => transactionParsing('./src/tests/azad_test_data/transactions/DReffects/2025-06-08')
);

test(
  'transaction page graph experiment amazon.co.uk',
  () => transactionParsing('./src/tests/azad_test_data/transactions/cmulcahy/2025-06-09')
);

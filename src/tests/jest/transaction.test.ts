import * as fs from 'fs';
const jsdom = require('jsdom');

// Note that we do not import transaction0 or transaction1...
// ...they are abstracted by transaction.
import * as tn from '../../js/transaction';


type Difference = string;

function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size == b.size && [...a].every(value => b.has(value));
}

function compareTransactions(a: tn.Transaction, b: tn.Transaction): Difference[] {
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

export function compareLists(a: tn.Transaction[], b: tn.Transaction[]): Difference[] {
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

function scrapePageOfTransactionsFromCannedHtml(htmlFilePath: string): tn.Transaction[] {
  const html: string = fs.readFileSync(htmlFilePath, 'utf8');
  const doc = new jsdom.JSDOM(html).window.document;
  return tn.extractPageOfTransactions(doc);
}

describe('can read some transactions', () => {
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

      expect(transactions.length).toEqual(40);
  });

  test(
    'cmulcahy', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html');

      expect(transactions.length).toEqual(20);
  });
});

describe (
  'multi-strategy transaction scraping and verification',

  () => {
    function scrapeAndVerify(pathStem: string): void {
      const htmlPath = pathStem + '.html';
      const jsonPath = pathStem + '.expected.json';
      const html: string = fs.readFileSync(htmlPath, 'utf8');
      const doc: Document = new jsdom.JSDOM(html).window.document;
      const transactions = tn.extractPageOfTransactions(doc);

      const expected = JSON.parse(
        fs.readFileSync(jsonPath, 'utf8')) as tn.Transaction[];

      expected.forEach(t => t.date = new Date(t.date));
      const differences = compareLists(transactions, expected);
      console.log(`differences: ${JSON.stringify(differences)}`);
      expect(differences.length).toEqual(0);
    }

    test(
      'transaction amazon.de',
      () => scrapeAndVerify(
        './src/tests/azad_test_data/transactions/DReffects/2025-06-08')
    );

    test(
      'transaction amazon.co.uk pmulcahy',
      () => scrapeAndVerify(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-06-08')
    );

    test(
      'transaction amazon.co.uk cmulcahy',
      () => scrapeAndVerify(
        './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09')
    );
  }
);

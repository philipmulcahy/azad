import * as fs from 'fs';
const jsdom = require('jsdom');

// Note that we do not import transaction0 or transaction1...
// ...they are abstracted by transaction.
import * as tn from '../../js/transaction';

type Difference = string;

// Be very careful about using this function - it's only intention is to help tests pass where we have
// potentially dodgy date logic impact.
function getUTCDateString(d: Date): string {
  const dd = new Date(d.toUTCString());  // defensive copy, because we're going to do some editing.

  if (dd.getUTCHours() > 12) {
      dd.setUTCHours(0);
      dd.setUTCDate(d.getUTCDate() + 1);  // "magically" this copes with end of month - setting 32 is OK for example.
  }

  return [
    dd.getUTCFullYear().toString(),
    (dd.getUTCMonth() + 1).toString().padStart(2, '0'),
    dd.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

function compareTransactions(a: tn.Transaction, b: tn.Transaction): Difference[] {
  const differences: Difference[] = [];
  const keys = tn.getTransactionKeys();

  function getStringVal(t: tn.Transaction, k: keyof tn.Transaction): string {
    const val = t[k];

    return (k.toString() == 'date') ?
      getUTCDateString(val as Date) :
      JSON.stringify(val);
  }

  for (const k of keys) {
    const aVal = getStringVal(a, k);
    const bVal = getStringVal(b, k);

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
    'philipmulcahy_I', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-06-08.html');

      expect(transactions.length).toEqual(20);
  });

  test(
    'philipmulcahy_II', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-11-10.html');

      expect(transactions.length).toEqual(39);
  });

  test(
    'benhbell', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/benhbell/2025-08-07.html');

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
      'transaction amazon.co.uk pmulcahy I',
      () => scrapeAndVerify(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-06-08')
    );

    test(
      'transaction amazon.co.uk pmulcahy II',
      () => scrapeAndVerify(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-11-10')
    );

    test(
      'transaction amazon.co.uk cmulcahy',
      () => scrapeAndVerify(
        './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09')
    );
  }
);

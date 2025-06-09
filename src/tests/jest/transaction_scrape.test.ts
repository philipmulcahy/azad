import { extractPageOfTransactions, Transaction } from '../../js/transaction';
const jsdom = require('jsdom');
import * as fs from 'fs';

function scrapePageOfTransactionsFromCannedHtml(htmlFilePath: string): Transaction[] {
  const html: string = fs.readFileSync(htmlFilePath, 'utf8');
  const doc = new jsdom.JSDOM(html).window.document;
  const transactions = extractPageOfTransactions(doc);
  return transactions;
}

describe('can read 20 transactions from first page of philipmulcahy\'s account', () => {
  test(
    'can read 20 transactions', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-06-08.html');

      expect(transactions.length).toEqual(20);
  });
});

describe('can read 20 transactions from first page of DReffects\'s account', () => {
  test(
    'can read 20 transactions', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/DReffects/2025-06-08.html');

      expect(transactions.length).toEqual(20);
  });
});

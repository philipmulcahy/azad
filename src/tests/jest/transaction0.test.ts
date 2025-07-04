import * as fs from 'fs';
import {Transaction} from '../../js/transaction';
import {extractPageOfTransactions} from '../../js/transaction0';
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
});


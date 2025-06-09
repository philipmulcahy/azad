import { extractPageOfTransactions } from '../js/transaction';
const jsdom = require('jsdom');
import * as fs from 'fs';

describe('can read 20 transactions from first page of philipmulcahy\'s account', () => {
  test(
    'can read 20 transactions', () => {
      const htmlFilePath = './src/tests/azad_test_data/transactions/philipmulcahy/2025-06-08.html';
      // const htmlFilePath = './azad_test_data/transactions/philipmulcahy/2025-06-08.html';
      const html: string = fs.readFileSync(htmlFilePath, 'utf8');
      const doc = new jsdom.JSDOM(html).window.document;
      const transactions = extractPageOfTransactions(doc);
      expect(transactions.length).toEqual(20);
  });
});


import { extractPageOfTransactions, Transaction } from '../../js/transaction';
const jsdom = require('jsdom');
import * as fs from 'fs';

function scrapePageOfTransactionsFromCannedHtml(htmlFilePath: string): Transaction[] {
  const html: string = fs.readFileSync(htmlFilePath, 'utf8');
  const doc = new jsdom.JSDOM(html).window.document;
  const transactions = extractPageOfTransactions(doc);
  return transactions;
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

//TODO remove everything below this line (and this line) - it's experimental

import * as extraction from '../../js/extraction';
import * as util from '../../js/util';

const idre = util.orderIdRegExp().source;

function nodePath(node: Node): string[] {
  const path: string[] = [node.nodeName];

  while (node.parentNode) {
    node = node.parentNode;
    path.push(node.nodeName);
  }

  return path;
}

function elemContainsOrderId(node: Node): boolean {
  return node.textContent.match(idre) != null;
}

function getOrderId(node: Node): string {
  return node.textContent.match(idre)[1] 
}

function textNodesUnder(n: Node): Node[] {
  const children: Node[] = [];
  const walker = n.ownerDocument.createTreeWalker(
    n,
    4,  // NodeFilter.SHOW_TEXT apparently not available in node.js
  );

  while(walker.nextNode()) {
    children.push(walker.currentNode);
  }

  return children;
}

test(
  'transaction page graph experiment',
  () => {
    const htmlFilePath =
      './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html';

    const html: string = fs.readFileSync(htmlFilePath, 'utf8');
    const doc = new jsdom.JSDOM(html).window.document;
    const allTextNodes = textNodesUnder(doc.documentElement);

    expect(allTextNodes.length).toBeGreaterThan(100);
    
    const idElems = allTextNodes.filter(elem => {
      const text = elem.textContent;

      // prune out big slabs of text
      if (text.length > 500) {
        return false;
      }

      return elemContainsOrderId(elem); 
    });

    idElems.forEach(e => {
      const path = nodePath(e);
      const id = getOrderId(e);
      console.log(`${id} ${path.join(', ')}`);
    });
  
    const ids = idElems.map(
      elem => elem.textContent.match(idre)[1]
    );

    expect(ids.length).toBeGreaterThan(20);
    console.log(`order id elems: ${ids.join(', ')}`);
  }
);

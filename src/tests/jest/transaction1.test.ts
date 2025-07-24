import * as fs from 'fs';
import { compareLists } from './transaction.test';
import { Transaction } from '../../js/transaction';
import {
  extractPageOfTransactions,
  ComponentName,
  patterns,
  ClassedNode} from '../../js/transaction1';

const jsdom = require('jsdom');


describe(
  'transaction date regex',
  () => {

    function verifyDateExtraction(dateString: string) {
      const re = patterns.get(ComponentName.DATE)!;
      const match = dateString.match(re);
      expect(match).not.toBeNull;
      expect(match![0]).toEqual(dateString);
    }

    test(
      'amazon.co.uk',
      () => {
        verifyDateExtraction('09 Jun 2025');
        verifyDateExtraction('07 Feb 2005');
      }
    );

    test(
      'amazon.de',
      () => {
        verifyDateExtraction('04. Juni 2025');
        verifyDateExtraction('08. Mai 2025');
      }
    );
  }
);

test(
  'transaction card digits regex',
  () => {
    const p = patterns.get(ComponentName.CARD_DIGITS)!;
    expect('1234'.match(p)).not.toBeNull();
    expect('ab34'.match(p)).toBeNull();
    expect('12cd'.match(p)).toBeNull();
  }
);

test(
  'transaction blanked card digits regex',
  () => {
    const p = patterns.get(ComponentName.BLANKED_DIGITS)!;
    expect('••••'.match(p)).not.toBeNull();
    expect('1234'.match(p)).toBeNull();
    expect('abcd'.match(p)).toBeNull();
  }
);

test(
  'transaction page graph experiment amazon.co.uk',
  () => {
    const htmlFilePath =
      './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html';

    const html: string = fs.readFileSync(htmlFilePath, 'utf8');
    const doc: Document = new jsdom.JSDOM(html).window.document;
    const rootClassified = ClassedNode.create(doc.documentElement);

    function countType(name: ComponentName): number {
      return rootClassified.classedDescendants.filter(
        d => d.components.has(name)
      ).length;
    }

    expect(countType(ComponentName.ORDER_ID)).toEqual(22);
    expect(countType(ComponentName.GIFT_CARD)).toEqual(1);
    expect(countType(ComponentName.CARD_DETAILS)).toEqual(19);
    expect(countType(ComponentName.PAYMENT_SOURCE)).toEqual(20);
    expect(countType(ComponentName.TRANSACTION)).toEqual(20);
  }
);

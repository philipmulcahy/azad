/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import * as order_data from '../order_data';
import * as extraction from '../../js/extraction';
const jsdom = require('jsdom');

test('detail extraction', () => {
  const order_detail_html = order_data.order_D01_9960417_3589456_html();
  const context = 'detail_extraction_test';
  const doc = new jsdom.JSDOM(order_detail_html).window.document;
  const def = 'N/A';

  const basic: string = extraction.by_regex(
    [
      '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(., "VAT: ")]]'
    ],
    /VAT: (?:[^-$£€0-9]*)([-$£€0-9.]*)/,
    def,
    doc.documentElement,
    context,
  ) ?? def;

  expect(basic).toEqual('£0.90');
});

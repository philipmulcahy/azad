/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import * as tests from './tests';
import * as order_data from './order_data';
import * as extraction from '../js/extraction';

const detailExtractionTest = function(): boolean {
    const order_detail_html = order_data.order_D01_9960417_3589456_html();
    const parser = new DOMParser();
    const doc = parser.parseFromString( order_detail_html, 'text/html' );
//        const order = {
//            id: 'D01-9960417-3589456',
//            total: 0,
//        };
//        const extracted = amazon_order_history_order.extractDetailFromDoc(
//            order,
//            doc
//        );
    const basic = extraction.by_regex(
        [
            '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(., "VAT: ")]]'
        ], 
        /VAT: (?:[^-$£€0-9]*)([-$£€0-9.]*)/, 
        'N/A',
        doc.documentElement
    );
    if (basic) {
        return basic.substring(3) == '0.90';
    }
    return false;
};

const extraction_tests = {
    detail_extraction_test: detailExtractionTest,
};

tests.register('extraction_tests', extraction_tests);

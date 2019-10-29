/* Copyright(c) 2019 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */
/* jslint node:true */
'use strict';

import tests from './tests';
import order_data from './order_data';
import extraction from '../js/extraction';

const detailExtractionTest = () => {
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
    return basic.substring(3) === '0.90';
};

const extraction_tests = {
    detail_extraction_test: detailExtractionTest,
};

tests.register('extraction_tests', extraction_tests);

export default {};

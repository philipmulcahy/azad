/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const extraction_tests = (() => {
    "use strict";

    const detailExtractionTest = () => {
        const order_detail_html = amazon_order_history_test_order_data.order_D01_9960417_3589456_html();
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
        const basic = amazon_order_history_extraction.by_regex(
            [
                '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(., "VAT: ")]]'
            ], 
            /VAT: (?:[^-$£€0-9]*)([-$£€0-9.]*)/, 
            'N/A',
            doc.documentElement
        );
        return basic.substring(3) == '0.90';
    };

    return {
        detail_extraction_test: detailExtractionTest,
    };
})()

tests.register('extraction_tests', extraction_tests);

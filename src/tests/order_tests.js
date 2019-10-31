/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

import order_data from './fake_order'; 
const assert = require('assert');

const order_id ='026-5653597-4769168';
const scrape_date = '2019-10-28';
const site = 'amazon.co.uk';

const order_promise = order_data.orderFromTestData(
    order_id,
    scrape_date,
    site
);
const expectations_promise = order_data.expectedFromTestData(
    order_id,
    scrape_date,
    site
);
Promise.all([order_promise, expectations_promise]).then( results => {
    const [order, expected] = results;
    Object.keys(expected).forEach(key => {
        const expected_value = expected[key];
        const actual_value = order[key];
        assert(
            JSON.stringify(actual_value) == JSON.stringify(expected_value),
            order_id + ':' + scrape_date + '.' + key + ' should be ' +
            expected_value + ' but we got ' + actual_value
        );
    });
});

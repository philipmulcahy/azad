/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

import * as order_data from './fake_order'; 
const assert = require('assert');

const test_targets = order_data.discoverTestData();

function testOneTarget( target: any ): any {
    const result = {
        test_id: 'ORDER_SCRAPE_' + target.site + '_' + target.order_id + '_' + target.scrape_date,
        passed: false,
        defects: [],
    };
    const order_promise = order_data.orderFromTestData(
        target.order_id,
        target.scrape_date,
        target.site
    );
    const expectations_promise = order_data.expectedFromTestData(
        target.order_id,
        target.scrape_date,
        target.site
    );
    return Promise.all([order_promise, expectations_promise]).then( params => {
        const [order, expected] = params;
        const keys = Object.keys(expected);
        const key_validation_promises = keys.map(key => {
            const expected_value = expected[key];
            const actual_value_promise = order.getValuePromise(key);
            return actual_value_promise.then( actual_value => {
                if ( JSON.stringify(actual_value) != JSON.stringify(expected_value) ) {
                    const msg = key + ' should be ' + expected_value + ' but we got ' + actual_value;
                    result.defects.push(msg);
                }
            })
        });
        return Promise.all(key_validation_promises).then( () => {
            if (result.defects.length == 0) {
                result.passed = true;
            }
            return result;
        });
    });
}

test_targets.then(
    targets => Promise.all(targets.map( target => testOneTarget(target) ))
).then(
    results => console.log(results)
);

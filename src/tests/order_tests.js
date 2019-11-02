/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

import order_data from './fake_order'; 
const assert = require('assert');

const test_targets = order_data.discoverTestData();
test_targets.then( target => console.log(target) );

function testOneTarget( target ) {
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
    return Promise.all([order_promise, expectations_promise]).then( results => {
        const [order, expected] = results;
        Object.keys(expected).forEach(key => {
            try {
                const expected_value = expected[key];
                const actual_value = order[key];
                if ( JSON.stringify(actual_value) != JSON.stringify(expected_value) ) {
                    throw key + ' should be ' +
                    expected_value + ' but we got ' + actual_value;
                }
            } catch (ex) {
                result.defects.push(ex);
            }
        });
        if (result.defects.length == 0) {
            result.passed = true;
        }
        console.log(result);
        return result;
    });
}

test_targets.then(
    targets => targets.map( target => testOneTarget(target) )
).then(
    results => console.log(results)
); 

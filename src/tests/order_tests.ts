/* Copyright(c) 2019 Philip Mulcahy. */

import * as order_data from './fake_order'; 
import * as util from './../js/util';

const assert = require('assert');

const test_targets = order_data.discoverTestData();

interface ITestResult {
    test_id: string;
    passed: boolean;
    defects: string[];
}

function testOneTarget(
    target: order_data.ITestTarget
): Promise<ITestResult> {
    const result: ITestResult = {
        test_id: 'ORDER_SCRAPE_' +
                 target.site + '_' +
                 target.order_id + '_' +
                 target.scrape_date,
        passed: false,
        defects: [],
    };
    console.log('testing:', target.site, target.order_id);
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
        const key_validation_promises = keys.map( key => {
            const expected_value = util.defaulted(expected[key], '');
            const actual_value_promise = order[key]();
            return actual_value_promise.then( (actual_value: string) => {
                console.log('key:', key, expected_value, actual_value);
                const actual_string = JSON.stringify(actual_value);
                const expected_string = JSON.stringify(expected_value);
                if ( actual_string != expected_string ) {
                    const msg = key + ' should be ' + expected_string +
                        ' but we got ' + actual_string;
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
    (targets: order_data.ITestTarget[]) => Promise.all(
        targets.map( target => testOneTarget(target) )
    )
).then(
    (results: ITestResult[]) => console.log(results)
);

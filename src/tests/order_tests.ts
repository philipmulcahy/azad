/* Copyright(c) 2019-2021 Philip Mulcahy. */

import * as order_data from './fake_order';
import * as azad_entity from '../js/entity';
import * as azad_item from '../js/item';
import * as azad_order from '../js/order';
import * as util from '../js/util';

const assert = require('assert');

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
    const order: azad_order.IOrder = order_data.orderFromTestData(
        target.order_id,
        target.scrape_date,
        target.site
    );
    const expected = order_data.expectedFromTestData(
        target.order_id,
        target.scrape_date,
        target.site
    );
    const keys = Object.keys(expected);
    const key_validation_promises = keys.map( key => {
        let expected_value = util.defaulted(expected[key], '');
        const actual_value_promise = (order as Record<string, any>)[key]();
        return actual_value_promise.then( (actual_value: azad_entity.Value) => {
            console.log('key:', key, expected_value, actual_value);
            if ( key.toLowerCase().includes('date') ) {
              actual_value = util.dateToDateIsoString(actual_value as Date)
            }
            if ( key == 'item_list' ) {
              const strip_uninteresting_fields = function(item_list: azad_item.IItem[]): azad_item.IItem[] {
                item_list.forEach(item => {
                  ['order_date', 'order_id', 'order_detail_url', 'parent_order'].forEach( key => {
                    delete (item as any)[key];
                  });
                });
                return item_list;
              }
              expected_value = strip_uninteresting_fields(expected_value as azad_item.IItem[]);
              actual_value = strip_uninteresting_fields(actual_value as azad_item.IItem[]);
            }
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
}

function main() {
    // const single_test_order = order_data.orderFromTestDataB();
    const test_targets = order_data.discoverTestData();
    const test_results_promise = Promise.all(
        test_targets
            // .filter(target => target.order_id == '002-9651082-1715432')
            // .filter(target => target.order_id == '112-1097135-4205023')
            // .filter(target => target.order_id == '114-0199479-3410664')
            // .filter(target => target.order_id == '114-2140650-5679427')
            // .filter(target => target.order_id == '203-5043319-1160320')
            // .filter(target => target.order_id == '206-1563844-4321133')
            // .filter(target => target.order_id == 'D01-8755888-0539825')
            .map(target => testOneTarget(target)));
    test_results_promise.then(
        (results: ITestResult[]) => console.log(results)
    );
}

main();

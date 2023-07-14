/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

const $ = require('jquery');

interface ITest {
    (): (boolean | Promise<boolean>);
}

interface ITestSuite {
    [name: string]: ITest;
}

const test_suites: Record<string, ITestSuite> = {};

export function register(name: string, test_suite: ITestSuite) {
    if (name in test_suites) {
        throw 'name already registered: ' + name;
    }
    test_suites[name] = test_suite;
}

export async function runAll(doc: HTMLDocument) {
    const table = $(doc.body).find('#results_table')[0];
    Object.keys(test_suites).forEach( suite_name => {
        console.log('found test suite: ' + suite_name);
        const suite = test_suites[suite_name];
        Object.keys(suite)
            .filter( key => key.endsWith('_test') )
            .forEach( async function(key) {
                const test = suite[key];
                let passed: boolean = false;
                try {
                    passed = await test();
                } catch(ex) {
                    console.warn(ex);
                }
                const row = doc.createElement('tr');
                table.appendChild(row);
                const suite_name_td = doc.createElement('td');
                row.appendChild(suite_name_td);
                const key_td = doc.createElement('td');
                row.appendChild(key_td);
                const result_td = doc.createElement('td');
                row.appendChild(result_td);
                suite_name_td.textContent = suite_name;
                key_td.textContent = key;
                result_td.textContent = passed ? 'PASS' : 'FAIL';
                result_td.setAttribute('class', passed ? 'good' : 'bad');
            });
    });
}

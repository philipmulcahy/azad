/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */
/* jslint node:true */

'use strict';

import $ from 'jquery';

const test_suites = {};

function register(name, test_suite) {
    if (name in test_suites) {
        throw 'name already registered: ' + name;
    }
    test_suites[name] = test_suite;
}

function runAll(doc) {
    const table = $(doc.body).find('#results_table')[0];
    Object.keys(test_suites).forEach( suite_name => {
        console.log('found test suite: ' + suite_name);
        const suite = test_suites[suite_name];
        Object.keys(suite)
            .filter( key => key.endsWith('_test') )
            .forEach( key => {
                const test = suite[key];
                const passed = test();
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
                result_td.textContent = passed;
                result_td.setAttribute('class', passed ? 'good' : 'bad');
            });
    });
}

export default {
    register: register,
    runAll: runAll
};

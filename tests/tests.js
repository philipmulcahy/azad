/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const tests = (() => {
    "use strict";

    const test_suites = [];

    function register(test_suite) {
        test_suites.push(test_suite);
    }

    function runAll(doc) {
        const table = $(doc.body).find('#results_table')[0];
        test_suites.forEach( suite => {
            Object.keys(suite)
                .filter( key => key.endsWith('_test') )
                .forEach( key => {
                    console.log('found test suite: ' + key);
                    const test = suite[key];
                    const passed = test();
                    const row = doc.createElement('tr');
                    table.appendChild(row);
                    const key_td = doc.createElement('td');
                    row.appendChild(key_td);
                    const result_td = doc.createElement('td');
                    row.appendChild(result_td);
                    key_td.textContent = key;
                    result_td.textContent = passed;
                    result_td.setAttribute('class', passed ? 'good' : 'bad');
                });
        });
    }

    return {
        register: register,
        runAll: runAll
    }
})();

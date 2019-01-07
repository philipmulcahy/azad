/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const cache_tests = (() => {
    "use strict";

    const endtoend_test = () => {
        cachestuff.set('test_key', 'the quick brown fox');
        return cachestuff.get('test_key') == 'the quick brown fox';
    };

    const fill_test = () => {
        Array.from(Array(10000).keys()).forEach( i => {
            cachestuff.set('test_key' + i, 'the quick brown fox');
        });
        return true;
    };

    return {
        endtoend_test: endtoend_test,
        fill_test: fill_test,
    };
})()

tests.register('cache_tests', cache_tests);

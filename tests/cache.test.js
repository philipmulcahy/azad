/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const cache_tests = (() => {
    "use strict";

    const endtoend_test = () => {
        cachestuff.set('test_key', 'the quick brown fox');
        return cachestuff.get('test_key') == 'the quick brown fox';
    };

    return {
        endtoend_test: endtoend_test,
    };
})()

tests.register('cache_tests', cache_tests);

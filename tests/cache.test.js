/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const cache_tests = (() => {
    "use strict";

    const joke_test = () => {
         return (
             date.normalizeDateString('29 Dezember 2017') == '2017-12-29' &&
             date.normalizeDateString('29. Dezember 2017') == '2017-12-29'
         );
    };

    return {
        joke_test: joke_test,
    };
})()

tests.register('date', cache_tests);

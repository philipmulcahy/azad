/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const date_tests = (() => {
    "use strict";

    const fr_locale_test = () => {
         return date.normalizeDateString('29 mai 2018') == '2018-05-29';
    };

    return {
        fr_locale_test: fr_locale_test
    };
})()

tests.register(date_tests);

/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const date_tests = (() => {
    "use strict";

    const fr_locale_test = () => {
         return date.normalizeDateString('29 mai 2018') == '2018-05-29';
    };

    const generic_test = () => {
         return (
             date.normalizeDateString('October 14, 2016') == '2016-10-14' && // US
             date.normalizeDateString('15 July 2018') == '2018-07-15' &&     // UK
             date.normalizeDateString('29 mai 2018') == '2018-05-29'         // FR
         );
    };

    return {
        fr_locale_test: fr_locale_test,
        generic_test: generic_test
    };
})()

tests.register(date_tests);

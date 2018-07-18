/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const date_tests = (() => {
    "use strict";

    const de_test = () => {
         return (
             date.normalizeDateString('29 Dezember 2017') == '2017-12-29' &&
             date.normalizeDateString('29. Dezember 2017') == '2017-12-29'
         );
    };

    const fr_test = () => {
         return (
             date.normalizeDateString('29 mai 2018') == '2018-05-29' &&
             date.normalizeDateString('29. mai 2018') == '2018-05-29'
         );
    };

    const it_test = () => {
         return (
             date.normalizeDateString('22. luglio 2016') == '2016-07-22'
         );
    };

    const uk_test = () => {
         return (
             date.normalizeDateString('15 July 2018') == '2018-07-15'
         );
    };

    const us_test = () => {
         return (
             date.normalizeDateString('October 14, 2016') == '2016-10-14'
         );
    };

    return {
        de_test: de_test,
        fr_test: fr_test,
        it_test: it_test,
        uk_test: uk_test,
        us_test: us_test
    };
})()

tests.register('date', date_tests);

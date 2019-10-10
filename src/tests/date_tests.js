/* Copyright(c) 2019 Philip Mulcahy. */
/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

// 2019-10-6 ScottMcNay -- Added ISO test
// 2019-10-6 ScottMcNay -- Added other tests (commented out); see samples at https://ipfs.io/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki/Date_format_by_country.html
// 2019-10-6 ScottMcNay -- Updated copyright

'use strict';

import tests from './tests';
import date from '../js/date';

const de_test = () => {
     return (
         date.normalizeDateString('29 Dezember 2017') == '2017-12-29' &&
         date.normalizeDateString('29. Dezember 2017') == '2017-12-29'
     );
};

const es_test = () => {
    return (
        date.normalizeDateString('16 de noviembre de 2018') == '2018-11-16' &&
        date.normalizeDateString('23 de agosto de 2016') == '2016-08-23'
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
         date.normalizeDateString('15 July 2018') == '2018-07-15' &&
         date.normalizeDateString('4 March 2018') == '2018-03-04'
     );
};

const au_test = () => {
     return (
         date.normalizeDateString('15 July 2018') == '2018-07-15' &&
         date.normalizeDateString('4 March 2018') == '2018-03-04'
     );
};

const us_test = () => {
     return (
         date.normalizeDateString('October 14, 2016') == '2016-10-14'
     );
};

const iso_test = () => {
     return (
         date.normalizeDateString('2016-10-14') == '2016-10-14'
     );
};

// const other_test = () => {
// -----------------------------------------
// Note that these will fail; the normalization is for text dates.
// -----------------------------------------
//     return (
//         date.normalizeDateString('14.10.2016') == '2016-10-14'
//         date.normalizeDateString('14. 10. 2016') == '2016-10-14'
//         date.normalizeDateString('14-10-2016') == '2016-10-14'
//         date.normalizeDateString('14/10/2016') == '2016-10-14'
//         date.normalizeDateString('2016 10 14') == '2016-10-14'
//         date.normalizeDateString('20161014') == '2016-10-14'
//         date.normalizeDateString('2016.10.14') == '2016-10-14'
//         date.normalizeDateString('2016/10/14') == '2016-10-14'
//         date.normalizeDateString('14/10 2016') == '2016-10-14' //oddball
//         date.normalizeDateString('14/10-2016') == '2016-10-14' //oddball
//         date.normalizeDateString('10/14/2016') == '2016-10-14' //oddball
//         date.normalizeDateString('10-14/-2016') == '2016-10-14' //oddball
//         date.normalizeDateString('2016.14.10') == '2016-10-14' //oddball
//      );
// };

const date_tests = {
    de_test: de_test,
    es_test: es_test,
    fr_test: fr_test,
    it_test: it_test,
    uk_test: uk_test,
    au_test: au_test,
    us_test: us_test,
//    other_test: other_test,
    iso_test: iso_test
};

tests.register('date_tests', date_tests);

export default {};

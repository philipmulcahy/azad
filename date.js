/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const date = (() => {
    "use strict";

    function localDateFromMoment(m) {
        const d = m.toDate();
        return sprintf('%d-%02d-%02d', d.getYear()+1900, d.getMonth()+1, d.getDate());
    }

    function normalizeDateString(ds) {
        return localDateFromMoment(moment(ds, ['DD MMM YYYY'], 'fr'));
    }

    return {
        normalizeDateString: normalizeDateString
    };
})();

/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const date = (() => {
    "use strict";

    function normalizeDateString(ds) {
        return moment(ds, ['DD MMM YYYY'], 'fr').toISOString()
    }

    return {
        normalizeDateString: normalizeDateString
    };
})();

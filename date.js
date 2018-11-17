/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const date = (() => {
    "use strict";

    function localDateFromMoment(m) {
        const d = m.toDate();
        return sprintf('%d-%02d-%02d', d.getYear()+1900, d.getMonth()+1, d.getDate());
    }

    const LOCALES = ['de', 'en', 'en-gb', 'es', 'fr', 'it'];

    function normalizeDateString(ds) {
        const mom = LOCALES.map( locale => moment(ds, 'LL', locale, true) )
                           .filter( m => m.isValid() )[0];

        if (!mom) {
            console.warn('could not parse date: ' + ds);
            return ds;
        }
        return localDateFromMoment(mom);
    }

    return {
        normalizeDateString: normalizeDateString
    };
})();

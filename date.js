/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const date = (() => {
    "use strict";

    function localDateFromMoment(m) {
        const d = m.toDate();
        return sprintf('%d-%02d-%02d', d.getYear()+1900, d.getMonth()+1, d.getDate());
    }

    const FORMATS = [
        {format: 'DD MMM YYYY', locale: 'fr'},
        {format: 'D MMM YYYY', locale: 'fr'},
        {format: 'DD. MMM YYYY', locale: 'fr'},
        {format: 'D. MMM YYYY', locale: 'fr'},
        {format: 'MMMM DD, YYYY', locale: 'en'},
        {format: 'DD MMMM YYYY', locale: 'en'},
        {format: 'D MMMM YYYY', locale: 'en'},
        {format: 'DD MMMM YYYY', locale: 'de'},
        {format: 'D MMMM YYYY', locale: 'de'},
        {format: 'DD. MMMM YYYY', locale: 'de'},
        {format: 'D. MMMM YYYY', locale: 'de'},
        {format: 'DD MMMM YYYY', locale: 'it'},
        {format: 'D MMMM YYYY', locale: 'it'},
        {format: 'DD. MMMM YYYY', locale: 'it'},
        {format: 'D. MMMM YYYY', locale: 'it'}
    ];
    function normalizeDateString(ds) {
        const mom = FORMATS.map( rule => moment(ds, rule.format, rule.locale, true) )
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

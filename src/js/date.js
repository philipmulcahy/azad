/* Copyright(c) 2018 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

"use strict";

import moment from 'moment';
import sprintf from 'sprintf-js';

function localDateFromMoment(m) {
    const d = m.toDate();
    return sprintf.sprintf('%d-%02d-%02d', d.getYear()+1900, d.getMonth()+1, d.getDate());
}

const LOCALES = ['de', 'en', 'en-gb', 'es', 'fr', 'it'];

const ALT_FORMATS = [
    {format: 'DD MMM YYYY', locale: 'fr'},
    {format: 'D MMM YYYY', locale: 'fr'},
    {format: 'DD. MMM YYYY', locale: 'fr'},
    {format: 'D. MMM YYYY', locale: 'fr'},
    {format: 'MMMM DD, YYYY', locale: 'en'},
    {format: 'DD MMMM YYYY', locale: 'en'},
    {format: 'D MMMM YYYY', locale: 'en'},
    {format: 'D MMM. YYYY', locale: 'en'},
    {format: 'DD MMM. YYYY', locale: 'en'},
    {format: 'DD MMMM YYYY', locale: 'de'},
    {format: 'D MMMM YYYY', locale: 'de'},
    {format: 'DD. MMMM YYYY', locale: 'de'},
    {format: 'D. MMMM YYYY', locale: 'de'},
    {format: 'DD MMMM YYYY', locale: 'it'},
    {format: 'D MMMM YYYY', locale: 'it'},
    {format: 'DD. MMMM YYYY', locale: 'it'},
    {format: 'D. MMMM YYYY', locale: 'it'}
];

function getMoms(ds) {
    return LOCALES.map( locale => moment(ds, 'LL', locale, true) ).concat(
        ALT_FORMATS.map(
            rule => moment(ds, rule.format, rule.locale, true)
        )
    );
}

function  getMom(ds) {
    return getMoms(ds).filter( m => m.isValid() )[0];
}

function normalizeDateString(ds) {
    const mom = getMom(ds);
    if (!mom) {
        console.warn('could not parse date: ' + ds);
        return ds;
    }
    return localDateFromMoment(mom);
}

export default {
    normalizeDateString: normalizeDateString
};

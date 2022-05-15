/* Copyright(c) 2018 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

"use strict";

// 2020-05 moment's typing is not 'normal'.
// See https://stackoverflow.com/questions/36648231/how-can-moment-js-be-imported-with-typescript
// and also esModuleInterop = true in tsconfig.js
const moment = require('moment');

import { sprintf } from 'sprintf-js';

interface Moment {
    toDate: () => Date;
}

function localDateFromMoment(m: any): string {
    const d = m.toDate();
    return sprintf(
        '%d-%02d-%02d',
        d.getYear()+1900, d.getMonth()+1, d.getDate()
    );
}

const LOCALES = ['de', 'en', 'en-gb', 'es', 'fr', 'it'];

const ALT_FORMATS = [
    {format: 'DD MMM YYYY', locale: 'fr'},
    {format: 'D MMM YYYY', locale: 'fr'},
    {format: 'DD. MMM YYYY', locale: 'fr'},
    {format: 'D. MMM YYYY', locale: 'fr'},
    {format: 'YYYY-MM-DD', locale: 'en'},
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

function getMoms(ds: string) {
    return LOCALES.map(
        locale => moment(ds, 'LL', locale, true)
    ).concat(
        ALT_FORMATS.map(
            rule => moment(ds, rule.format, rule.locale, true)
        )
    );
}

function  getMom(ds: string) {
    return getMoms(ds).filter( m => m.isValid() )[0];
}

export function normalizeDateString(ds: string): string {
    if ( !ds ) { return "N/A"; }
    const mom = getMom(ds);
    if (!mom) {
        console.warn('could not parse date: ' + ds);
        return ds;
    }
    return localDateFromMoment(mom);
}

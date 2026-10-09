/* Copyright(c) 2018-2026 Philip Mulcahy. */

"use strict";

import moment, { Moment } from 'moment';
import { sprintf } from 'sprintf-js';

function localDateFromMoment(m: Moment): string {
    const d = m.toDate();
    return sprintf(
        '%d-%02d-%02d',
        d.getFullYear(), d.getMonth()+1, d.getDate()
    );
}

const LOCALES = ['de', 'en', 'en-gb', 'es', 'fr', 'it'];

const ALT_FORMATS = [
    {format: 'DD MMM YYYY', locale: 'fr'},
    {format: 'DD MMM YYYY', locale: 'en'},
    {format: 'DD MMM YYYY', locale: 'en-gb'},
    {format: 'D MMM YYYY', locale: 'fr'},
    {format: 'DD. MMM YYYY', locale: 'fr'},
    {format: 'D. MMM YYYY', locale: 'fr'},
    {format: 'YYYY-MM-DD', locale: 'en'},
    {format: 'MMMM DD, YYYY', locale: 'en'},
    {format: 'MMM DD, YYYY', locale: 'en'},
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

export function getDateRegex(): RegExp {
    const month = '(?:' + Array.from(new Set<string>([
      // Deutsch
      'Jan', 'Feb', 'März', 'Apr', 'Mai', 'Jun',
      'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec', 'Dez',
      'Januar', 'Februar', 'März', 'April',
      'Mai', 'Juni', 'Juli', 'August',
      'September', 'Oktober', 'November', 'Dezember',

      // English
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      'January', 'February', 'March', 'April',
      'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December',

      // French
      'Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin',
      'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc',
      'Janvier', 'Février', 'Mars', 'Avril',
      'Mai', 'Juin', 'Juillet', 'Août',
      'Septembre', 'Octobre', 'Novembre', 'Décembre',

      // Numeric
      '01', '02', '03', '04', '05', '06',
      '07', '08', '09', '10', '11', '12',
    ])).sort().join('|') + ')';

    const year = '(?:20\\d\\d)';
    const date = '(?:[012]?\\d|3[01])';

    const patterns = [
      `(?:${date}\\.? ${month} ${year})`,  // .co.uk, .de
      `(?:${month} ${date}, ${year})`,  // .com
      `(?:${year}-${month}-${date})`  // alternate, rational universe
    ];

    return new RegExp('(?:' + patterns.join('|') + ')');
}

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
    if (!ds) {
      return "N/A";
    }

    const mom = getMom(ds);

    if (!mom) {
        console.warn('could not parse date: ' + ds);
        return ds;
    }

    return localDateFromMoment(mom);
}

/*
 * Turn the output of normalizeDateString ('YYYY-MM-DD') into a Date at local
 * midnight.
 * Why not new Date('YYYY-MM-DD')? That gives UTC midnight, which is the
 * previous evening anywhere west of Greenwich: an order placed on 1 January
 * then reads as 31 December of the year before in local time.
 */
export function dateFromNormalizedDateString(ds: string): Date {
  const match = ds.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    // normalizeDateString couldn't parse it, and handed it back unchanged:
    // leave it to the JS engine, as before. "N/A" gives an invalid Date.
    return new Date(ds);
  }

  const [year, month, day] = [+match[1], +match[2], +match[3]];
  const d = new Date(year, month - 1, day);

  // new Date(2026, 12, 45) rolls over into 2027; new Date('2026-13-45') was
  // invalid, and should stay so.
  if (d.getFullYear() != year || d.getMonth() != month - 1 ||
      d.getDate() != day) {
    return new Date('invalid');
  }

  return d;
}

/*
 * The calendar date that a date-only Date stands for.
 * Date-only values are either at local midnight (dateFromNormalizedDateString)
 * or at UTC midnight (new Date('YYYY-MM-DD'), which older versions of this
 * extension used and which cached entries may still hold). A value at UTC
 * midnight that isn't also at local midnight can only be the second kind, so
 * read it in UTC; read everything else in local time.
 */
function calendarDate(d: Date): {year: number, month: number, day: number} {
  const isUtcMidnight = d.getUTCHours() == 0 &&
                        d.getUTCMinutes() == 0 &&
                        d.getUTCSeconds() == 0 &&
                        d.getUTCMilliseconds() == 0;

  const isLocalMidnight = d.getHours() == 0 &&
                          d.getMinutes() == 0 &&
                          d.getSeconds() == 0 &&
                          d.getMilliseconds() == 0;

  if (isUtcMidnight && !isLocalMidnight) {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    };
  }

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

// The calendar year of a date-only value: see calendarDate.
export function calendarYear(d: Date): number {
  return calendarDate(d).year;
}

export type DateFilter = (d: Date|null) => boolean;

export function dateToDateIsoString(d: Date): string {
  if (isNaN(d.getTime()) ) {
    return 'Invalid date';
  }

  const cd = calendarDate(d);
  return sprintf('%04d-%02d-%02d', cd.year, cd.month, cd.day);
}

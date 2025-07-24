/* Copyright(c) 2016-2021 Philip Mulcahy. */

'use strict';

export function defaulted<T>(
    value: T | null | undefined,
    def_value: T
): T {
    if (value != null && typeof(value) !== 'undefined') {
        return value;
    }
    return def_value;
}

// Returns def_value if callable throws or returns null/undefined,
// else returns the result of callable.
export function defaulted_call<T>(
    callable: ()=>(T | null | undefined),
    def_value: T
): T {
    try {
      const value = callable();
      if (value != null && typeof(value) !== 'undefined') {
          return value;
      }
    }
    catch (ex) {
      console.log('util.defaulted_call caught ', ex);
    }
    return def_value;
}

export function parseStringToDOM(html: string) {
    if ( typeof(DOMParser) !== 'undefined' ) {
        // We're in a browser:
        const parser = new DOMParser();
        return parser.parseFromString( html, 'text/html' );
    } else {
        // DOMParse not present in node.js, so we need to get our own: jsdom.
        // We don't use jsdom all the time, because it in turn requires the
        // fs module which isn't available in browsers. (This was difficult
        // to debug!).
        const jsdom = require('jsdom');  // eslint-disable-line no-undef
        return new jsdom.JSDOM(html).window.document;
    }
}

function clean_mixed_decimal_separators(number_string: string): string {
  if (number_string.includes(',') && number_string.includes('.')) {
    const seps = number_string.replace(/[^.,]/g, '');
    const last = seps.substr(seps.length-1,1);
    const others = seps.replace(last, '');
    if (others.length != (seps.length-1)) {
      throw Error(number_string + ' has too many ' + last + ' chars.');
    }
    const cleaned = number_string.replace(others[0], '');
    return cleaned;
  }
  return number_string;
}

export function currencyRegex(): RegExp {
  // \u20ac is Euro symbol (€).
  // Sometimes typing it "properly" seems to break the regular
  // expression.
  return /(?:\u20ac|€|£|$|AUD|CAD|EUR|GBP|USD)/;
}

function parseToNumber(i: string | number): number {
  try {
    if(typeof i === 'string') {
      const c = clean_mixed_decimal_separators(i);
      if (
        c === 'N/A' ||
        c === '-' ||
        c === ''  ||
        c === 'pending'
      ) {
        return 0;
      } else {
        const cc = c.trim()
                    .replace( new RegExp(`^${currencyRegex().source} *`), '' )
                    .replace( /,/, '.' );
        const ccc = parseFloat(cc);
        return ccc;
      }
    }
    if(typeof i === 'number') {
      return i;
    }
  } catch (ex) {
    console.warn(ex);
  }
  return 0;
}

// Remove the formatting to get integer data for summation
export function floatVal(v: string | number): number {
  const candidate = parseToNumber(v);

  if (isNaN(candidate)) {
    if (typeof(v) === 'string') {
      const altered = (v as string).replace(currencyRegex(), '').trim();

      if(altered != v) {
          return floatVal(altered);
      }
    }
    return 0;
  }

  return candidate;
}

export function isNumeric(n: any) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

export function addButton(name: string, cb: any, button_class: string) {
    removeButton(name);
    const a = document.createElement('button');
    if(typeof(button_class) === 'undefined') {
        button_class = 'azad_default_button';
    }
    a.innerText = name;
    a.setAttribute('class', button_class);
    a.setAttribute('button_name', name);
    a.onclick = cb;
    document.body.insertBefore(
        a,
        document.body.firstChild
    );
}

export function removeButton(name: string) {
    const elem = document.querySelector('[button_name="' + name + '"]');
    if ( elem !== null ) {
        elem.parentNode!.removeChild(elem);
    }
}

export function clearBody(): void {
    Array.from(document.body.children).forEach(
        function(elem: Element) {
            if( !(
                elem.hasAttribute('class') &&
                elem.getAttribute('class')!.includes('order_reporter_') &&
                elem.getAttribute('class')!.includes('azad')
            )) {
                document.body.removeChild(elem);
            }
        }
    );
}

export function moneyRegEx(): RegExp {
    return /\s*(-?(GBP|USD|CAD|EUR|AUD|[$£€])?\s?(\d+[.,]\d\d))\s*/;
/*
    /
        \s*
        (
            -?
            (
                GBP|USD|CAD|EUR|AUD|[$£€]
            )?
            \s?
            (\d+[.,]\d\d)
        )
        \s*
    /
*/
}

export function orderIdRegExp(): RegExp {
  return new RegExp(
    '.*(' +
    [
      // vanilla numeric 3-7-7 with optional leading 'D'
      // 202-5113396-3949156
      '[A-Z0-9]\\d\\d-\\d{7}-\\d{7}',

      // 2025+ amazon fresh hex 8-4-4-12
      // 4a378358-f4f0-445a-87de-111b068ff0fc
      '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',
    ].join('|') +
    ').*'
  );
  // return /.*([A-Z0-9]\d\d-\d{7}-\d{7}).*/;
}

export async function get_settled_and_discard_rejects<T>(
  promises: Promise<T>[]
): Promise<T[]> {
    const maybes = await Promise.allSettled(promises);
    const fulfilled = maybes
      .filter( m => m.status == 'fulfilled' )
      .map( m => (m as PromiseFulfilledResult<T>).value );
    return fulfilled;
}

// Helper for filter_by_async_predicate.
class MappedPredicate<T> {
  subject: T;
  criterion: boolean;

  constructor(subject: T, criterion: boolean) {
    this.subject = subject;
    this.criterion = criterion;
  }
}

// Helper for filter_by_async_predicate.
class MappedPromisedPredicate<T> {
  subject: T;
  criterion_promise: Promise<boolean>;

  constructor(subject: T, criterion_promise: Promise<boolean>) {
    this.subject = subject;
    this.criterion_promise = criterion_promise;
  }

  unified(): Promise<MappedPredicate<T>> {
    return this.criterion_promise.then(
      (criterion: boolean) => new MappedPredicate<T>( this.subject, criterion)
    );
  }
}

export async function filter_by_async_predicate<T>(
  candidates: T[],
  predicate: (t: T) => Promise<boolean>
): Promise<T[]> {
  const promised_mappings: Promise<MappedPredicate<T>>[] = candidates
    .map(c => new MappedPromisedPredicate<T>(c, predicate(c)).unified() );
  const mapped_predicates: MappedPredicate<T>[] = await get_settled_and_discard_rejects(promised_mappings);
  const filtered: T[] = mapped_predicates.filter(mp => mp.criterion).map(mp => mp.subject);
  return filtered;
}

function subtract_one_month(date: Date): Date {
  const result = new Date(date);
  if (result.getMonth() == 0) {
    result.setFullYear(result.getFullYear() - 1);
    result.setMonth(11);
  } else {
    result.setMonth(result.getMonth() - 1);
  }
  return result;
}

export function subtract_months(date: Date, months: number): Date {
  let result = new Date(date);
  for (let i=months; i>0; --i) {
    result = subtract_one_month(result);
  }
  return result;
}

export function is_promise(candidate: any): boolean {
  if (typeof(candidate) != 'object') {
    return false;
  }
  if ('then' in candidate) {
    return true;
  }
  return false;
}

export function first_acceptable_non_throwing<T>(
  strategies: (()=>T)[],
  acceptable_predicate: ((t: T)=>boolean),
  default_t: T,
): T | null {
  for (const s of strategies) {
    try {
      const t = s();
      if (acceptable_predicate(t)) {
        return t;
      }
    } catch(ex) {
      console.log('caught:', ex);
    }
  }
  return default_t;
}

export function safe_new_tab_link(url: string, title: string): string {
  return '<a ' +
         'href="' + url + '" ' +
         'target="_blank" ' +
         'rel="noopener noreferrer"' +
         '>' + title + '</a>';
}

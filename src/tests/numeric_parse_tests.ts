/* Copyright(c) 2023 Philip Mulcahy. */

'use strict';

import * as tests from './tests';
import * as util from '../js/util';

function zero_test() {
  return util.floatVal('0') == 0;
}

function currency_zero_test(): boolean {
  try {
    ['CAD', 'AUD', 'CAD', '€', 'EUR', 'GBP', '$', 'USD'].forEach(
      (ccy: string) => {
        const szero = '0.00';
        const s1 = ccy + szero;
        const s2 = ccy + ' ' + szero;
        if (util.floatVal(s1) != 0) {
          throw 'bad';
        }
        if (util.floatVal(s2) != 0) {
          throw 'also bad';
        }
      }
    );
  } catch (_) {
    return false;
  }
  return true;
}

function dot_as_decimal_test() {
  return util.floatVal('123.456') == 123.456;
}

function comma_as_decimal_test(): boolean {
  return util.floatVal('123,456') == 123.456;
}

function dot_as_decimal_difficult_test(): boolean {
  return util.floatVal('123,456.789') == 123456.789;
}

function comma_as_decimal_more_difficult_test(): boolean {
  return util.floatVal(' \u20ac27,58 ') == 27.58 &&
         util.floatVal('€27,58') == 27.58;
}

function comma_as_decimal_difficult_test(): boolean {
  return util.floatVal('123.456,789') == 123456.789;
}

const numeric_parse = {
    zero_test: zero_test,
    currency_zero_test: currency_zero_test,
    dot_as_decimal_test: dot_as_decimal_test,
    comma_as_decimal_test: comma_as_decimal_test,
    dot_as_decimal_difficult_test: dot_as_decimal_difficult_test,
    comma_as_decimal_difficult_test: comma_as_decimal_difficult_test,
    comma_as_decimal_more_difficult_test: comma_as_decimal_more_difficult_test,
};

tests.register('numeric_parse', numeric_parse);

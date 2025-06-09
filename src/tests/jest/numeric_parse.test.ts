/* Copyright(c) 2023 Philip Mulcahy. */

'use strict';

import * as util from '../../js/util';


describe('exercise numeric string parsing', () => {
  test ('zero', () => {
    expect(util.floatVal('0')).toEqual(0);
  });

  test( 'currency_zero', () => {
    ['CAD', 'AUD', 'CAD', '€', 'EUR', 'GBP', '$', 'USD'].forEach(
      (ccy: string) => {
        const szero = '0.00';
        const s1 = ccy + szero;
        const s2 = ccy + ' ' + szero;
        expect(util.floatVal(s1)).toEqual(0);
        expect(util.floatVal(s2)).toEqual(0);
      }
    );
  });

  test( 'dot_as_decimal', () => {
    expect(util.floatVal('123.456')).toEqual(123.456);
  });

  test( 'comma_as_decimal', () => {
   expect(util.floatVal('123,456')).toEqual(123.456);
  });

  test( 'dot_as_decimal_difficult', () => {
    expect(util.floatVal('123,456.789')).toEqual(123456.789);
  });

  test( 'comma_as_decimal_more_difficult', () => {
    expect(util.floatVal(' \u20ac27,58 ')).toEqual(27.58)
    expect(util.floatVal('€27,58')).toEqual(27.58);
  });

  test( 'comma_as_decimal_difficult', () => {
    expect(util.floatVal('123.456,789')).toEqual(123456.789);
  });
});

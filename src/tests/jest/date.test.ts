/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import * as date from '../../js/date';

describe('date parsing', () => {

  test('de_test', () => {
    expect(date.normalizeDateString('29 Dezember 2017')).toEqual('2017-12-29');
    expect(date.normalizeDateString('29. Dezember 2017')).toEqual('2017-12-29');
  });

  test('es_test', () => {
    expect(date.normalizeDateString('16 de noviembre de 2018')).toEqual('2018-11-16');
    expect(date.normalizeDateString('23 de agosto de 2016')).toEqual('2016-08-23');
  });

  test('fr_test', () => {
    expect(date.normalizeDateString('29 mai 2018')).toEqual('2018-05-29');
    expect(date.normalizeDateString('29. mai 2018')).toEqual('2018-05-29');
  });

  test('it_test', () => {
    expect(date.normalizeDateString('22. luglio 2016')).toEqual('2016-07-22');
  });

  test('uk_test', () => {
    expect(date.normalizeDateString('15 July 2018')).toEqual('2018-07-15');
    expect(date.normalizeDateString('4 March 2018')).toEqual('2018-03-04');
  });

  test('au_test', () => {
    expect(date.normalizeDateString('15 July 2018')).toEqual('2018-07-15');
    expect(date.normalizeDateString('4 March 2018')).toEqual('2018-03-04');
  });

  test('us_test', () => {
    expect(date.normalizeDateString('October 14, 2016')).toEqual('2016-10-14');
  });

});

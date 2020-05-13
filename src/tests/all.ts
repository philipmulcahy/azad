/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import cache_tests from './cache_tests'
import date_tests from './date_tests'
import extraction_tests from './extraction_tests'
import tests from './tests'

window.onload = () => tests.runAll(document);

export default {};

/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import './cache_tests'
import './date_tests'
import './extraction_tests'
import './get_years_tests'
import { runAll } from './tests'

window.onload = () => runAll(document);

export default {};

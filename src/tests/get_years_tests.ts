/* Copyright(c) 2023 Philip Mulcahy. */

'use strict';

import * as tests from './tests';
import * as fu from './util/file';
import * as extraction from '../js/extraction';

const yearsExtractionTest = function(): boolean {
    // Get list of available years from amazon orders "home" page.
    const doc = fu.doc_from_html_file_path(
      'azad_test_data/get_years/PhilipMulcahy_2023-09-09.html');
    const years = extraction.get_years(doc);
    console.log('extracted years', years);
    return false;
};

const years_tests = {
    years_extraction_test: yearsExtractionTest,
};

// tests.register('get_years_tests', years_tests);

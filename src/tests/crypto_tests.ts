/* Copyright(c) 2025- Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import * as tests from './tests';
import * as crypto from '../js/crypto';

// Demonstrate that successive encryptions of the same plaintext do not yield
// equal cyphertext.
async function endtoendTest() {
  const originalText = 'Confidential data';
  const encryptedText1 = crypto.encrypt(originalText);
  const encryptedText2 = crypto.encrypt(originalText);
  return encryptedText1 != encryptedText2;
}

const cache_tests = {
  endtoend_test: endtoendTest,
};

tests.register('crypto_tests', cache_tests);

/* Copyright(c) 2025- Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import * as crypto from '../../js/crypto';

test(
  'Demonstrate that successive encryptions of the same plaintext do not yield equal cyphertext.',
  async () => {
    const originalText = 'Confidential data';
    const encryptedText1 = crypto.encrypt(originalText);
    const encryptedText2 = crypto.encrypt(originalText);
    expect(encryptedText1).not.toEqual(encryptedText2);
  }
);

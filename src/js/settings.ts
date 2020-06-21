/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

export function initialiseUi() {
    const KEY = 'azad_settings';
    chrome.storage.sync.get(
        KEY,
        function(entries) {
            console.log('settings retrieved: ' + JSON.stringify(entries));
        }
    );
}

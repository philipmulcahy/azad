/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

const Vue = require('vue');

export function initialiseUi() {
    const KEY = 'azad_settings';
    const vue_settings_app = new Vue({
        el: '#azad_settings',
        data: {
            checked_settings: []
        },
        watch: {
            checked_settings: function(new_settings: any) {
                const value = JSON.stringify(new_settings);
                const entry: Record<string, any> = {};
                entry[KEY] = value;
                chrome.storage.sync.set(
                    entry,
                    function() {
                        console.log('settings stored: ' + value);
                    }
                );
            }
        }
    });
    chrome.storage.sync.get(
        KEY,
        function(entries) {
            console.log('settings retrieved: ' + JSON.stringify(entries));
            vue_settings_app.checked_settings = JSON.parse(entries[KEY]);
        }
    );
}

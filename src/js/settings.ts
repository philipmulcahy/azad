/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

import * as util from './util';

"use strict";

export function initialiseUi() {
    const KEY = 'azad_settings';
    chrome.storage.sync.get(
        KEY,
        function(entries) {
            console.log('retrieved settings entries', entries);
            const settings = JSON.parse(entries[KEY]);
            console.log('translated settings entries', settings);
            console.log('settings retrieved: ' + JSON.stringify(settings));
            const key_to_elem: Record<string, HTMLElement> = {};
            util.findMultipleNodeValues(
                '//div[@id="azad_settings"]/input',
                document.documentElement
            ).map( node => <HTMLElement>node ).forEach( elem => {
                const key = elem.getAttribute('id');
                key_to_elem[key] = elem;
            });
            for ( let key in key_to_elem ) {
                let value: boolean = <boolean>settings[key];
                const elem = key_to_elem[key];
                if (value) {
                    elem.setAttribute('checked', 'true');
                }
                elem.onclick = () => {
                    value = value ? false : true;
                    settings[key] = value;
                    console.log('settings updated', settings);
                    const stringified_settings =  JSON.stringify(settings);
                    console.log('settings stringified', stringified_settings);
                    const updated_entries: Record<string, string> = {};
                    updated_entries[KEY] = stringified_settings;
                    chrome.storage.sync.set(
                        updated_entries,
                        function() {
                            if (chrome.runtime.lastError) {
                                console.warn(
                                    'settings not written:',
                                    chrome.runtime.lastError.message
                                );
                            } else {
                                console.log('settings written');
                            }
                        }
                    )
                    if (value) {
                        elem.setAttribute('checked', 'true');
                    } else {
                        elem.removeAttribute('checked');
                    }
                };
            }
        }
    );
}

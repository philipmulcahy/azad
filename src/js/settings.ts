/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

import * as util from './util';

"use strict";

const KEY = 'azad_settings';

export function initialiseUi(): Promise<void> {
    return new Promise<void>( function( resolve ) {
        chrome.storage.sync.get(
            KEY,
            function(entries) {
                const encoded_settings = entries[KEY];
                let settings: any = null;
                try{
                    settings = JSON.parse(encoded_settings);
                } catch (ex) {
                    console.error(
                        'JSON.parse blew up with:' + ex +  ' while parsing: ' +
                        encoded_settings
                    );
                    settings = {};
                }
                const key_to_elem: Record<string, HTMLElement> = {};
                const checkboxes = util.findMultipleNodeValues(
                    '//table[@id="azad_settings"]//input',
                    document.documentElement
                ).map( node => <HTMLElement>node );
                console.log('checkboxes: ', checkboxes);
                checkboxes.forEach( elem => {
                    const key = elem.getAttribute('id');
                    if (key) {
                        key_to_elem[key] = elem;
                    } else {
                        console.warn('no id attribute found');
                    }
                });
                for ( let key in key_to_elem ) {
                    let value: boolean = (settings && key in settings)  ?
                                         <boolean>settings[key] :
                                         false;
                    const elem = key_to_elem[key];
                    if (value) {
                        elem.setAttribute('checked', 'true');
                    }
                    elem.onclick = () => {
                        value = value ? false : true;
                        settings[key] = value;
                        const stringified_settings =  JSON.stringify(settings);
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
                                }
                            }
                        )
                        if (value) {
                            elem.setAttribute('checked', 'true');
                        } else {
                            elem.removeAttribute('checked');
                        }
                    };
                };
                resolve();
            }
        );
    });
}

export function getBoolean(key: string): Promise<boolean> {
    return new Promise<boolean>( function( resolve ) {
        chrome.storage.sync.get(
            KEY,
            function(entries) {
                const encoded_settings: string = entries[KEY];
                let settings: any = null;
                try {
                    settings = JSON.parse(encoded_settings);
                } catch(ex) {
                    console.error(
                        'JSON.parse blew up with: ' + ex + ' while parsing:' +
                        encoded_settings
                    );
                    resolve(false);
                    return;
                }
                const key_to_elem: Record<string, HTMLElement> = {};
                const value: boolean = <boolean>settings[key];
                resolve(value);
            }
        );
    });
}

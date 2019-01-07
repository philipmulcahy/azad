/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

var cachestuff = (function(){
    "use strict";

    function millisNow() {
        return (new Date()).getTime();
    }

    function reallySet(real_key, value) {
        window.localStorage.setItem(
            real_key,
            JSON.stringify({
                timestamp: millisNow(),
                value: value
            })
        );
    }

    function set(key, value) {
        const real_key = 'AZAD_' + key;
        try {
            reallySet(real_key, value);
        } catch(error) {
            console.log('failed to set ' + key + ': ' + error);
            trim();
            reallySet(real_key, value);
            console.log('set ' + key + ' on second attempt after trimming cache');
        }
    }

    function get(key) {
        const real_key = 'AZAD_' + key;
        return JSON.parse(window.localStorage.getItem(real_key)).value;
    }

    function trim() {
        console.log('trimming cache');
        const keys = Object.keys(window.localStorage).filter(
            key => key.startsWith('AZAD_')
        );
        const timestamps_by_key = {};
        keys.forEach( key => {
            try {
                timestamps_by_key[key] = JSON.parse(window.localStorage.getItem(key)).timestamp;
            } catch(error) {
                console.debug('couldn\'t get timestamp for key: ' + key);
            }
        });
        const timestamps = Object.values(timestamps_by_key);
        timestamps.sort();
        const cutoff_timestamp = timestamps[Math.floor(keys.length * 0.1)];
        Object.keys(timestamps_by_key).forEach( key => {
            if (timestamps_by_key[key] <= cutoff_timestamp) {
                window.localStorage.removeItem(key);        
            }
        });
    }

    return {
        set: set,
        get: get
    };
})();

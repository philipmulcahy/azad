/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

var cachestuff = (function(){
    "use strict";

    function millisNow() {
        return (new Date()).getTime();
    }

    function reallySet(key, value) {
        window.localStorage.setItem(
            key,
            JSON.stringify({
                timestamp: millisNow(),
                value: value
            })
        );
    }

    function set(key, value) {
        try {
            reallySet(key, value);
        } catch(error) {
            console.warn('failed to set: ' + error);
            trim();
            reallySet(key, value);
        }
    }

    function get(key) {
        return JSON.parse(window.localStorage.getItem(key)).value;
    }

    function trim() {
        const keys = Object.keys(window.localStorage);
        timestamps_by_key = {};
        keys.forEach( key => {
            timestamps_by_key[key] = JSON.parse(window.localStorage.getItem(key)).timestamp;
        });
        timestamps = Object.values(timestamps_by_key);
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

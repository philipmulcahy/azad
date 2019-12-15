/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

import lzjs from 'lzjs'
import settings_store from './settings_store'

function millisNow() {
    return (new Date()).getTime();
}

class SettingsImpl {
    constructor() {
        this.key_stem = 'AZAD-SETTINGS_';
        this.hit_count = 0;
    }

    buildRealKey(key) {
        return this.key_stem + key;
    }

    reallySet(real_key, value) {
        window.localStorage.setItem(
            real_key,
            JSON.stringify({
                timestamp: millisNow(),
                value: lzjs.compress(JSON.stringify(value)),
            })
        );
    }

    set(key, value) {
        const real_key = this.buildRealKey(key);
        this.reallySet(real_key, value);
    }

    get(key) {
        const real_key = this.buildRealKey(key);
        try {
            const encoded = window.localStorage.getItem(real_key);
            const packed = JSON.parse(encoded);
            if (!packed) {
                throw "not found";
            }
            ++this.hit_count;
            return JSON.parse(lzjs.decompress(packed.value));
        } catch(err) {
            return undefined;
        }
    }
}

function createLocalCache(cache_name) {
    const cache = new SettingsImpl(cache_name);
    return {
        set: (key, value) => cache.set(key, value),
        get: key => cache.get(key),
    };
}

export default {
    createLocalCache: createLocalCache
};

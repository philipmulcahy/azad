/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

const lzjs = require('lzjs');

function millisNow() {
    return (new Date()).getTime();
}

// Replace datey strings with equivalent Dates.
// Why? Because JSON.stringify and then JSON.parse
// causes Date objects to be converted to strings.
function restoreDates(obj: any) {
    if (typeof(obj) == 'object') {
        // restore any immediate child date values
        Object.keys(obj)
            .filter(key => key.endsWith('date'))
            .filter(key => typeof(obj[key]) == 'string')
            .forEach(key => {
                const value = obj[key];
                try {
                    const date = new Date(value);
                    obj[key] = date;
                } catch(ex) {
                    console.warn(
                        'tried to create Date from ' + value + ' for ' + key);
                }
            });
        // recurse
        Object.values(obj).forEach(v => restoreDates(v));
    }
}

class LocalCacheImpl {

    cache_name: string;
    key_stem: string;
    hit_count: number;

    constructor(cache_name: string) {
        this.cache_name = cache_name;
        this.key_stem = 'AZAD_' + this.cache_name + '_';
        this.hit_count = 0;
    }

    buildRealKey(key: string) {
        return this.key_stem + key;
    }

    reallySet(real_key: string, value: any) {
        window.localStorage.setItem(
            real_key,
            JSON.stringify({
                timestamp: millisNow(),
                value: lzjs.compress(JSON.stringify(value)),
            })
        );
    }

    set(key: string, value: any): void {
        const real_key: string = this.buildRealKey(key);
        try {
            this.reallySet(real_key, value);
        } catch(error) {
            console.log('failed to set ' + key + ': ' + error);
            this.trim();
            try {
                this.reallySet(real_key, value);
            } catch (second_error) {
                console.warn(
                    'couldn\'t save ' + key + ' to cache on second attempt'
                );
            }
            console.log('set ' + key + ' on second attempt after trimming cache');
        }
    }

    get(key: string): any {
        const real_key: string = this.buildRealKey(key);
        try {
            const encoded: string = window.localStorage.getItem(real_key)!;
            let packed: any = null;
            try {
                packed = JSON.parse(encoded);
            } catch (ex) {
                console.error(
                    'JSON.parse blew up with: ' + ex + ' while unpacking: ' +
                    encoded
                );
            }
            if (!packed) {
                throw "not found";
            }
            ++this.hit_count;
            const decompressed = lzjs.decompress(packed.value);
            try {
                const result: string = JSON.parse(decompressed);
                restoreDates(result);
                return result;
            } catch(ex) {
                console.error(
                    'JSON.parse blew up with: ' + ex + ' while unpacking: ' +
                    decompressed
                );
            }
            return null;
        } catch(err) {
            return undefined;
        }
    }

    hitCount(): number {
        return this.hit_count;
    }

    getRealKeys(): string[] {
        return Object.keys(window.localStorage).filter(
            key => key.startsWith(this.key_stem)
        );
    }

    trim(): void {
        console.log('trimming cache');
        const real_keys: string[] = this.getRealKeys();
        const timestamps_by_key: Record<string, number> = {};
        real_keys.forEach( key => {
            try {
                const encoded = window.localStorage.getItem(key);
                try {
                    const decoded = JSON.parse(encoded!);
                    timestamps_by_key[key] = decoded.timestamp;
                } catch(ex) {
                    console.error(
                        'JSON.parse blew up with: ' + ex + ' while unpacking: ' +
                        encoded
                    );
                }
            } catch(error) {
                console.debug('couldn\'t get timestamp for key: ' + key);
            }
        });
        const timestamps = Object.values(timestamps_by_key);
        timestamps.sort();
        const cutoff_timestamp = timestamps[Math.floor(real_keys.length * 0.25)];
        let removed_count = 0;
        Object.keys(timestamps_by_key).forEach( key => {
            if (timestamps_by_key[key] <= cutoff_timestamp) {
                window.localStorage.removeItem(key);
                ++removed_count;
            }
        });
        console.log('removed ' + removed_count + ' entries');
    }

    clear() {
        console.log('clearing cache');
        this.getRealKeys().forEach( key => {
            window.localStorage.removeItem(key);
        });
    }
}

export interface Cache {
    set: (key: string, value: any) => void;
    get: (key: string) => any;
    clear: () => void;
    hitCount: () => number;
}

export function createLocalCache(cache_name: string): Cache {
    const cache = new LocalCacheImpl(cache_name);
    return {
        set: (key: string, value: any) => cache.set(key, value),
        get: (key: string) => cache.get(key),
        clear: () => cache.clear(),
        hitCount: () => cache.hitCount(),
    };
}

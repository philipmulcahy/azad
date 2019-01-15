/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const cachestuff = (function(){
    "use strict";

    function millisNow() {
        return (new Date()).getTime();
    }

    class LocalCacheImpl {
        constructor(cache_name) {
            this.cache_name = cache_name;
            this.key_stem = 'AZAD_' + this.cache_name + '_';
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

        get(key) {
            const real_key = this.buildRealKey(key);
            try {
                const encoded = window.localStorage.getItem(real_key);
                const packed = JSON.parse(encoded);
				++this.hit_count;
                return JSON.parse(lzjs.decompress(packed.value));
            } catch(err) {
                return undefined;
            }
        }

		hitCount() {
			return this.hit_count;
		}

        getRealKeys() {
            return Object.keys(window.localStorage).filter(
                key => key.startsWith(this.key_stem)
            );
        }

        trim() {
            console.log('trimming cache');
            const real_keys = this.getRealKeys();
            const timestamps_by_key = {};
            real_keys.forEach( key => {
                try {
                    timestamps_by_key[key] = JSON.parse(window.localStorage.getItem(key)).timestamp;
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

    
    const createLocalCache = (cache_name) => {
        const cache = new LocalCacheImpl(cache_name);
        return {
            set: (key, value) => cache.set(key, value),
            get: key => cache.get(key),
            clear: () => cache.clear(),
            hitCount: () => cache.hitCount(),
        };
    };

    return {
        createLocalCache: createLocalCache
    };
})();

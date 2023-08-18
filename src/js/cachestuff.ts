/* Copyright(c) 2019-2023 Philip Mulcahy. */

///////////////////////////////////////////////////////////////////////////////
// SOME AZAD CACHEING PRINCIPLES
///////////////////////////////////////////////////////////////////////////////
// These words are not intended to be general axioms of good cacheing practise,
// instead they are thoughts on how to structure Azad's use of cache in a
// consistent manner.
//
// 1) Cache entries are at the same cardinality as URLs - one cache entry
//    replaces one fetch. One reason to favour this approach is that fetches
//    are the activity that consumes most time in Azad's use.
// 2) Cache entries don't have to contain raw HTML - instead it's better if
//    they contain serialized business objects that are the desired result of
//    a fetch, and subsequent post-processing. This means less wasted space
//    and repeated computation.
// 3) Avoid cache the same data twice: if a composite object contains results
//    from multiple fetches, either store the composite in the cache, or the
//    components, but not both.
// 4) Sometimes a fetch contributes to multiple business objects - for example
//    a order list page can contain 10 orders. We need to decide how to satisfy
//    rule 3.
// 5) There should not be more than one scheduleToPromise call in a file: if
//    you are fetching more than one kind of query in your file, you should
//    split it.
//
// As of 2023-08-13, in this code branch, there are three use patterns:
// i)   IOrdersPageData: represents a group of typically 10 order "headers"
// ii)  IOrderDetailsAndItems: properly parsed - no extraneous data.
// iii) string[]: payments, one per string - stronger typing needed here.
///////////////////////////////////////////////////////////////////////////////

"use strict";

const lzjs = require('lzjs');

function millisNow() {
    return (new Date()).getTime();
}

// Replace datey strings with equivalent Dates.
// Why? Because JSON.stringify and then JSON.parse
// causes Date objects to be converted to strings.
function restoreDates(obj: any) {
    if (typeof(obj) == 'object' && obj != null) {
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

// Find broken parent promises and fix 'em.
// Why? Because JSON.stringify/JSON.parse causes
// Promises to be replaced with empty objects.
function restoreParentPromises(obj: any) {

  function recursivelyRestore(obj: object, parent: object|null) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value == 'object' && value != null) {
        if (Object.keys(value).length == 0) {  // don't zap actual data
          if (parent && key.startsWith('parent_') ) {
            const parent_promise = Promise.resolve(parent);
            (obj as {[key:string]:any})[key] = parent_promise;
          }
        } else if (Array.isArray(value)) {  // non empty object
          value.forEach( child => recursivelyRestore(child, obj) );
        } else {
          recursivelyRestore(value, obj);
        }
      }
    }
  }

  recursivelyRestore(obj, null);
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
            console.log(
              'set ' + key + ' on second attempt after trimming cache');
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
                const result: object = JSON.parse(decompressed);
                restoreDates(result);
                restoreParentPromises(result);
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
              'JSON.parse blew up with: ' + ex + ' while unpacking: ' + encoded
            );
          }
        } catch(error) {
          console.debug('couldn\'t get timestamp for key: ' + key);
        }
      });
      const timestamps = Object.values(timestamps_by_key);
      timestamps.sort();
      const cutoff_timestamp = timestamps[
        Math.floor(real_keys.length * 0.25)];
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

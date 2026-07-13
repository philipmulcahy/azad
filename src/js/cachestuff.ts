/* Copyright(c) 2019-2023 Philip Mulcahy. */

import * as util from './util';
import * as lzjs from 'lzjs';

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
//    and less repeated computation.
// 3) Avoid cacheing the same data twice: if a composite object contains
//    results from multiple fetches, either store the composite in the cache,
//    or the components, but not both.
// 4) Sometimes a fetch contributes to multiple business objects - for example
//    a order list page can contain 10 orders. We need to decide how to satisfy
//    rule 3.
// 5) There should not be more than one request.makeAsyncRequest call in a
//    file: if you are fetching more than one kind of query in your file, you
//    should split it.
//
// As of 2024-12-27, in this code branch, there are five use patterns:
// i)   order_list_page.ts: represents a group of typically 10 order "headers"
// ii)  order_details.ts: properly parsed - no extraneous data.
// iii) order_impl.ts: Payments.
// iv)  shipment.ts.
// iv)  item.ts.
///////////////////////////////////////////////////////////////////////////////

"use strict";

interface Store {
  get(key: string): Promise<unknown>;
  keys(): Promise<string[]>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

// Only intended to allow tests to work outside of a chrome extension,
// where chrome.storage.local is not available.
function CreateMockStore(): Store {
  const _store: Record<string, unknown> = {};

  return {
    get: function(key: string): Promise<unknown> {
      const value = _store[key];
      return Promise.resolve(value);
    },
    keys: function(): Promise<string[]> {
      return Promise.resolve(Object.keys(_store));
    },
    set: async function(key: string, value: unknown) {
      _store[key] = value;
    },
    remove: async function(key: string): Promise<void> {
      delete _store[key];
    },
  };
}


export function registerCacheListenerInBackgroundPage() {
  chrome.runtime.onMessage.addListener(
    function(request, _sender, responseCallback) {
      const store = CreateRealStore();
      switch(request.action) {
        case 'azad-cache-get':
          store.get(request.key).then(
            value => {
              responseCallback(value);
              console.debug(
                'azad-cache-get responding to', request.key, 'with', value);
            },
            err => {
              const errs = util.stringifyError(err);
              const msg = `while handling azad-cache-get we caught: ${err}`;
              console.debug(msg);
            }
          );
          break;
        case 'azad-cache-getkeys':
          store.keys().then(
            keys => responseCallback(keys),
            err => {
              const errs = util.stringifyError(err);
              const msg = `while handling azad-cache-getkeys we caught: ${err}`;
              console.debug(msg);
            },
          );
          break;
        case 'azad-cache-set':
          store.set(request.key, request.value).then(
            response => responseCallback(response),
            err => {
              const errs = util.stringifyError(err);
              const msg = `while handling azad-cache-set we caught: ${err}`;
              console.debug(msg);
            },
          );
          break;
        case 'azad-cache-remove':
          store.remove(request.key).then(
            response => responseCallback(response),
            err => {
              const errs = util.stringifyError(err);
              const msg = `while handling azad-cache-remove we caught: ${err}`;
              console.debug(msg);
            },
          );
          break;
        default:
          console.debug('ignoring action:', request.action);
          break;
      }

      // return true is needed for responseCallback to deliver the actual
      // result back to caller when we're doing asynchronous stuff to get the
      // result.
      return true;
    }
  );
}


// Use this class if you're in a content script, because chrome.storage.local
// is not there, and this class can proxy your cache actions to the
// service worker.
function CreateRealStoreProxy(): Store {
  return {
    get: async function(key: string): Promise<unknown> {
      return new Promise<unknown>( resolve => {
        chrome.runtime.sendMessage(
          {
            action: 'azad-cache-get',
            key: key,
          },
          resolve
        );
      }).then( response => {
        console.debug('RealStoreProxy get', key, 'got', response);
        return response;
      });
    },
    keys: async function(): Promise<string[]> {
      return new Promise<string[]>( resolve => {
        chrome.runtime.sendMessage(
          {
            action: 'azad-cache-getkeys',
          },
          resolve
        );
      });
    },
    set: async function(key: string, value: unknown): Promise<void> {
      return new Promise<void>( resolve => {
        chrome.runtime.sendMessage(
          {
            action: 'azad-cache-set',
            key: key,
            value: value,
          },
          resolve
        );
      });
    },
    remove: async function(key: string): Promise<void> {
      return new Promise<void>( resolve => {
        chrome.runtime.sendMessage(
          {
            action: 'azad-cache-remove',
            key: key,
          },
          resolve
        );
      });
    },
  };
}

// Store interface compliant wrapper for chrome.storage.local.
// This only works in your background/service-worker page.
function CreateRealStore(): Store {
  return {
    get: async function(key: string): Promise<unknown> {
      const entries = (await chrome.storage.local.get(key)) as Record<string, unknown>;
      if (Object.keys(entries).length) {
        return Object.values(entries)[0];
      }
      return null;
    },
    keys: async function(): Promise<string[]> {
      const entries = await new Promise<Record<string, unknown>>(
        resolve => chrome.storage.local.get(null, items => resolve(items || {}))
      );
      const keys = Object.keys(entries);
      return keys;
    },
    set: function(key: string, value: unknown): Promise<void> {
      const entry: Record<string, unknown> = {};
      entry[key] = value;
      return chrome.storage.local.set(entry);
    },
    remove: async function(key: string): Promise<void> {
      return new Promise<void>(
        resolve => chrome.storage.local.remove(key, () => resolve())
      );
    },
  };
}

function CreateStore(): Store {
  try {
    typeof( chrome.storage.local );
  } catch (_ex) {
    // We're not in an extension, so we'll have to make do with an in-memory
    // substitute that we can use to allow tests to proceed.
    return CreateMockStore();
  }

  return CreateRealStoreProxy();
}

function millisNow() {
    return (new Date()).getTime();
}

const store: Store = CreateStore();

// Replace datey strings with equivalent Dates.
// Why? Because JSON.stringify and then JSON.parse
// causes Date objects to be converted to strings.
function restoreDates(obj: unknown) {
  if (typeof obj === 'object' && obj !== null) {
    const record = obj as Record<string, unknown>;

    // restore any immediate child date values
    Object.keys(record).filter(key => key.endsWith('date'))
      .filter(key => typeof record[key] === 'string')
      .forEach(key => {
        const value = record[key] as string;

        try {
          const date = new Date(value);
          record[key] = date;
        } catch(ex) {
          console.warn('tried to create Date from ' + value + ' for ' + key);
        }
      });

    // recurse
    Object.values(record).forEach(v => restoreDates(v));
  }
}

// Find broken parent promises and fix 'em.
// Why? Because JSON.stringify/JSON.parse causes
// Promises to be replaced with empty objects.
function restoreParentPromises(obj: unknown) {
  function recursivelyRestore(currentObj: Record<string, unknown>, parent: Record<string, unknown> | null) {
    for (const [key, value] of Object.entries(currentObj)) {
      if (typeof value === 'object' && value !== null) {
        const nestedRecord = value as Record<string, unknown>;
        if (Object.keys(nestedRecord).length === 0) {  // don't zap actual data
          if (parent && key.startsWith('parent_') ) {
            const parent_promise = Promise.resolve(parent);
            currentObj[key] = parent_promise;
          }
        } else if (Array.isArray(value)) {  // non empty object
          value.forEach( child => {
            if (typeof child === 'object' && child !== null) {
              recursivelyRestore(child as Record<string, unknown>, currentObj);
            }
          });
        } else {
          recursivelyRestore(nestedRecord, currentObj);
        }
      }
    }
  }

  if (typeof obj === 'object' && obj !== null) {
    recursivelyRestore(obj as Record<string, unknown>, null);
  }
}

interface PackedCacheEntry {
  timestamp: number;
  value: string;
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

  reallySet(real_key: string, value: unknown): Promise<void> {
    const serializedValue = JSON.stringify({
      timestamp: millisNow(),
      value: lzjs.compress(JSON.stringify(value)),
    });

    return store.set(real_key, serializedValue);
  }

  async set(key: string, value: unknown): Promise<void> {
    let resolvedValue = value;
    if (util.is_promise(resolvedValue)) {
      resolvedValue = await (resolvedValue as Promise<unknown>);
    }

    const real_key: string = this.buildRealKey(key);

    try {
      await this.reallySet(real_key, resolvedValue);
    } catch(error) {
      console.log('failed to set ' + key + ': ' + error);
      await this.trim();
      try {
        await this.reallySet(real_key, resolvedValue);
      } catch (second_error) {
        console.warn(
          'couldn\'t save ' + key + ' to cache on second attempt'
        );
      }
      console.log(
        'set ' + key + ' on second attempt after trimming cache');
    }
  }

  async get(key: string): Promise<unknown> {
    const real_key: string = this.buildRealKey(key);

    try {
      const encoded = await store.get(real_key);

      if (encoded == null || typeof encoded !== 'string') {
        console.debug('cachestuff.get did not find ', key);
        throw new Error(key + ' not found');
      }

      let packed: PackedCacheEntry | null = null;

      try {
        packed = JSON.parse(encoded) as PackedCacheEntry;
      } catch (ex) {
        console.error(
          'JSON.parse blew up with: ' + ex + ' while unpacking: ' + encoded
        );
        throw ex;
      }

      if (!packed || !packed.value) {
        throw new Error(key + ' not found');
      }

      ++this.hit_count;
      const decompressed = lzjs.decompress(packed.value);

      try {
        const result = JSON.parse(decompressed) as Record<string, unknown>;
        restoreDates(result);
        restoreParentPromises(result);
        return result;
      } catch(ex) {
        console.error(
          'JSON.parse blew up with: ' + ex + ' while unpacking: ' +
            decompressed
        );
        throw ex;
      }
    } catch(err) {
      console.debug('cachestuff.get caught ', err, ' for ', key);
      return undefined;
    }
  }

  hitCount(): number {
    return this.hit_count;
  }

  async getRealKeys(): Promise<string[]> {
    const all = await store.keys();

    const filtered = all.filter(
      key => key.startsWith(this.key_stem)
    );

    return filtered;
  }

  async trim(): Promise<void> {
    console.log('trimming cache');
    const real_keys: string[] = await this.getRealKeys();
    const timestamps_by_key: Record<string, number> = {};

    for (const key of real_keys) {
      try {
        const encoded = await store.get(key);
        if (typeof encoded === 'string') {
          try {
            const decoded = JSON.parse(encoded) as PackedCacheEntry;
            timestamps_by_key[key] = decoded.timestamp;
          } catch(ex) {
            console.error(
              'JSON.parse blew up with: ' + ex + ' while unpacking: ' + encoded
            );
          }
        }
      } catch(error) {
        console.debug('couldn\'t get timestamp for key: ' + key);
      }
    }

    const timestamps = Object.values(timestamps_by_key);
    timestamps.sort((a, b) => a - b);

    const cutoff_timestamp = timestamps[
      Math.floor(real_keys.length * 0.25)
    ];

    let removed_count = 0;

    for (const key of Object.keys(timestamps_by_key)) {
      if (timestamps_by_key[key] <= cutoff_timestamp) {
        await store.remove(key);
        ++removed_count;
      }
    }

    console.log('removed ' + removed_count + ' entries');
  }

  async clear(): Promise<void> {
    console.log('clearing cache');
    const keys = await this.getRealKeys();

    for (const key of keys) {
      await store.remove(key);
    }
  }
}

export interface Cache {
  set: (key: string, value: unknown) => void;
  get: (key: string) => Promise<unknown>;
  clear: () => void;
  hitCount: () => number;
}

export function createLocalCache(cache_name: string): Cache {
  const cache = new LocalCacheImpl(cache_name);

  return {
    set: (key: string, value: unknown) => { void cache.set(key, value); },
    get: (key: string) => cache.get(key),
    clear: () => { void cache.clear(); },
    hitCount: () => cache.hitCount(),
  };
}

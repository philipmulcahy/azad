/* Copyright(c) 2018-2020 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import * as tests from './tests';
import * as cachestuff from '../js/cachestuff';

async function endtoendTest() {
    const cache = cachestuff.createLocalCache('TESTENDTOEND');
    cache.clear();
    cache.set('test_key', 'the quick brown fox');
    const retrieved = await cache.get('test_key');
    return retrieved == 'the quick brown fox';
}

const fillTest = () => {
    const cache = cachestuff.createLocalCache('TESTFILL');
    cache.clear();
    Array.from(Array(10000).keys()).forEach( i => {
        cache.set('test_key' + i, 'the quick brown fox');
    });
    cache.clear();
    return true;
};

async function deepSerializationTest() {
    const cache = cachestuff.createLocalCache('TESTDEEPSERIALIZATION');
    cache.clear();
    cache.set('X', {
        'a': {
            'b': {
                'c': {
                    'd': {
                        'e': true
                    },
                },
            },
        },
    });
    const retrieved = await cache.get('X');
    return retrieved.a.b.c.d.e;
}

async function restoreParentTest(): Promise<boolean> {
    const order: any = {
      a: 'A',
      items: [{parent_order: null}],
      child_thing: {parent_order: null}
    };
    const parent = Promise.resolve(order);
    order.items[0].parent_order = parent;
    order.child_thing.parent_order = parent;

    const cache = cachestuff.createLocalCache('TESTRESTOREPARENT');
    cache.clear();
    cache.set('my_order', order);
    const retrieved = await cache.get('my_order');
    const item_parent = await retrieved.items[0].parent_order;
    const other_child_parent = await retrieved.child_thing.parent_order;
    return item_parent.a == 'A' && other_child_parent.a == 'A';
}

const cache_tests = {
    endtoend_test: endtoendTest,
    fill_test: fillTest,
    deep_serialization_test: deepSerializationTest,
    restore_parent_test: restoreParentTest,
};

tests.register('cache_tests', cache_tests);

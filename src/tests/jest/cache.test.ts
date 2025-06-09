/* Copyright(c) 2018-2020 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

import * as cachestuff from '../../js/cachestuff';

describe('cache operations', () => {

  test('end to end', async () => {
    const cache = cachestuff.createLocalCache('TESTENDTOEND');
    cache.clear();
    cache.set('test_key', 'the quick brown fox');
    const retrieved = await cache.get('test_key');
    expect(retrieved).toEqual('the quick brown fox');
  });

  test('fill', () => {
    const cache = cachestuff.createLocalCache('TESTFILL');
    cache.clear();
    Array.from(Array(10000).keys()).forEach( i => {
        cache.set('test_key' + i, 'the quick brown fox');
    });
    cache.clear();
  });

  test('deep serialisation', async () => {
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
    expect(retrieved.a.b.c.d.e).toEqual(true);
  });

  test('restore parent', async () => {
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
    expect(item_parent.a).toEqual('A')
    expect(other_child_parent.a).toEqual('A');
  });

});

/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const cache_tests = (() => {
    "use strict";

    const endtoendTest = () => {
        const cache = cachestuff.createCache('TESTENDTOEND');
        cache.clear();
        cache.set('test_key', 'the quick brown fox');
        return cache.get('test_key') == 'the quick brown fox';
    };

    const fillTest = () => {
        const cache = cachestuff.createCache('TESTFILL');
        cache.clear();
        Array.from(Array(10000).keys()).forEach( i => {
            cache.set('test_key' + i, 'the quick brown fox');
        });
        cache.clear();
        return true;
    };

    const deepSerializationTest = () => {
        const cache = cachestuff.createCache('TESTDEEPSERIALIZATION');
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
        const retrieved = cache.get('X');
        return retrieved.a.b.c.d.e;
    }

    return {
        endtoend_test: endtoendTest,
        fill_test: fillTest,
        deep_serialization_test: deepSerializationTest,
    };
})()

tests.register('cache_tests', cache_tests);

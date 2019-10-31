/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

import order_data from './fake_order'; 

const order = order_data.orderFromTestData(
    '026-5653597-4769168',
    '2019-10-28',
    'amazon.co.uk'
)

console.log('order tests complete');

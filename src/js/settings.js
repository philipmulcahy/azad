/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

import Vue from 'vue';

const options = [
    {
        id: 'show_where_are_my_buttons',
        text: 'show "where are my buttons" help at top of amazon pages"',
        default: true,
    },
    {
        id: 'show_where_are_my_other_buttons',
        text: 'show "where are my other buttons" help at top of amazon pages"',
        default: false,
    },
];

function initialiseUi() {
    const vue_settings_app = new Vue({
        el: '#azad_settings_row',
        data: {
            items: options,
        },
    });
}


export default {
    initialiseUi: initialiseUi,
}

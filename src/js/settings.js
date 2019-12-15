/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

import Vue from 'vue';

const defaults = [
    {
        id: 'show_where_are_my_buttons',
        text: 'show "where are my buttons" help at top of amazon pages"',
        default: true,
    },
];

function initialiseUi() {
    const vue_settings_app = new Vue({
        el: '#azad_settings_row',
        data: {
            items: defaults,
        },
    });
}


export default {
    initialiseUi: initialiseUi,
}

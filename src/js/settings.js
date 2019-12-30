/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

"use strict";

import Vue from 'vue';

function initialiseUi() {
    const vue_settings_app = new Vue({
      el: '#azad_settings',
      data: {
        checked_settings: []
      }
    })
}


export default {
    initialiseUi: initialiseUi,
}

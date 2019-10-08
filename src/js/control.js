/* Copyright(c) 2019 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

import $ from 'jquery';

function activateIdle() {
    $('#azad_clear_cache').removeClass('hidden');
    $('#azad_stop').addClass('hidden');
    $('#azad_show_simple').addClass('hidden');
    $('#azad_show_fancy').addClass('hidden');
    $('#azad_hide_controls').removeClass('hidden');
    console.log('hello world');
}

function activateScraping(years) {

}

function activateYearsDone(years) {
}

$(document).ready( activateIdle );

export default {
};

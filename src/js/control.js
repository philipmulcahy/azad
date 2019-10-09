/* Copyright(c) 2019 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

import $ from 'jquery';

function activateIdle() {
    console.log('activateIdle');
    showOnly(['azad_clear_cache', 'azad_hide_controls']);
    console.log('hello world');
}

function activateScraping(year) {
    console.log('activateScraping');
    showOnly(['azad_stop', 'azad_hide_controls']);
    $('#azad_state').text('scraping ' + year);
}

function activateDone(years) {
    console.log('activateDone');
    showOnly(['azad_clear_cache', 'azad_hide_controls']);
}

function showOnly(button_ids) {
    $('.azad_action').addClass('hidden');
    button_ids.forEach( id => $('#' + id).removeClass('hidden') ); 
}

let background_port = null;
function connectToBackground() {
    console.log('connectToBackground');
    background_port = chrome.runtime.connect(null, { name: 'azad_control' });
    background_port.onMessage.addListener( msg => {
        switch(msg.action) {
            case 'scrape_complete':
                break;
            case 'advertise_years':
                showYearButtons(msg.years);
                break;
            default:
                console.warn('unknown action: ' + msg.action); 
        }
    });
}

function registerActionButtons() {
    $('#azad_clear_cache').on('click', () => background_port.postMessage({action: 'clear_cache'}));
    $('#azad_stop').on('click', () => background_port.postMessage({action: 'stop'}));
    $('#azad_hide_controls').on('click', () => {
        console.log('closing popup');
        window.close();
    });
}

function showYearButtons(years) {
    console.log('show year buttons', years);
    $('.azad_year_button').remove();
    years.sort().reverse().forEach( year => {
        $('#azad_year_list').append(
            '<input type="button" class="azad_year_button" value="' + year + '" />'
        );
    });
    $('.azad_year_button').on('click', handleYearClick);
    
}

function handleYearClick(evt) {
    const year = evt.target.value;
    activateScraping(year);
    if (background_port) {
        console.log('sending scrape_years', year);
        background_port.postMessage({
            action: 'scrape_years',
            years: [year]
        });
    } else {
        console.warn('background_port not set');
    }
}

function init() {
    console.log('init');
    activateIdle();
    connectToBackground();
    registerActionButtons();
}

$(document).ready( () => init() );

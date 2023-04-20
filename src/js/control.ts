/* Copyright(c) 2019 Philip Mulcahy. */

'use strict';

const $ = require('jquery');

import * as settings from './settings';
import * as util from './util';

function activateIdle() {
    console.log('activateIdle');
    showOnly(['azad_clear_cache', 'azad_force_logout', 'azad_hide_controls']);
}

function activateScraping(years: number[]) {
    console.log('activateScraping');
    showOnly(['azad_stop', 'azad_hide_controls']);
    $('#azad_state').text('scraping ' + years.join(','));
}

function activateDone(years: number[]) {
    console.log('activateDone');
    showOnly(['azad_clear_cache', 'azad_force_logout', 'azad_hide_controls']);
    $('#azad_state').text(years.join(','));
}

function showOnly(button_ids: any[]) {
    $('.azad_action').addClass('hidden');
    button_ids.forEach( id => $('#' + id).removeClass('hidden') );
}

let background_port: chrome.runtime.Port|null = null;
function connectToBackground() {
    console.log('connectToBackground');

    // @ts-ignore: tsc objects to null first parameter for connect();
    background_port = chrome.runtime.connect(null, { name: 'azad_control' });

    background_port.onMessage.addListener( msg => {
        switch(msg.action) {
            case 'scrape_complete':
                break;
            case 'advertise_periods':
                const months = (msg.periods as number[]).filter(p => p<=12);
                const years = (msg.periods as number[]).filter(p => p>=2000);
                showMonthsButtons(months);
                showYearButtons(years);
                break;
            case 'statistics_update':
                {
                    const text = Object.entries(msg.statistics)
                        .map(([k,v]) => {return k + ':' + v;})
                        .join('; ');
                    $('#azad_statistics').text(text);
                    if ((msg.statistics.queued + msg.statistics.running) > 0) {
                        activateScraping(msg.periods);
                    } else {
                        activateDone(msg.periods);
                    }
                }
                break;
            default:
                console.warn('unknown action: ' + msg.action);
        }
    });
}

function registerActionButtons() {
    $('#azad_clear_cache').on('click', () => {
        if (background_port) {
            console.log('clear cache clicked');
            background_port.postMessage({action: 'clear_cache'});
        } else {
            console.warn('clear cache clicked, but I have no background port');
        }
    });
    $('#azad_force_logout').on('click', () => {
        console.log('force logout clicked');
        if (background_port) {
            console.log('force logout clicked');
            background_port.postMessage({action: 'force_logout'});
        } else {
            console.log('force logout clicked, but I have no background port');
        }
    });
    $('#azad_stop').on('click', () => {
        console.log('stop clicked');
        handleStopClick();

    });
    $('#azad_hide_controls').on('click', () => {
        console.log('closing popup');
        window.close();
    });
}

function showYearButtons(years: number[]) {
    console.log('show year buttons', years);
    $('.azad_year_button').remove();
    years.sort().reverse().forEach( year => {
        $('#azad_year_list').append(
            '<button class="azad_year_button" value="' + year + '">' + year + '</button>'
        );
    });
    $('.azad_year_button').on('click', handleYearClick);
}

function showMonthsButtons(month_counts: number[]) {
  console.log('show month buttons', month_counts);
  $('.azad_months_button').remove();
  month_counts.sort().forEach( month_count => {
    $('#azad_year_list').append(
      '<button class="azad_months_button" value="' + month_count + '" >' + month_count + 'm</button>' 
    );
  });
  $('.azad_months_button').on('click', handleMonthsClick);
}

function handleYearClick(evt: { target: { value: any; }; }) {
    const year = evt.target.value;
    const years = [year];
    activateScraping(years);
    if (background_port) {
        console.log('sending scrape_years', year);
        background_port.postMessage({
            action: 'scrape_years',
            years: years,
        });
    } else {
        console.warn('background_port not set');
    }
}

function handleMonthsClick(evt: { target: { value: any; }; }) {
    const month_count = Number(evt.target.value);
    const end_date = new Date();
    const start_date = util.subtract_months(end_date, month_count);
    activateScraping([month_count]);
    if (background_port) {
        console.log('sending scrape_range', start_date, end_date);
        background_port.postMessage({
            action: 'scrape_range',
            start_date: start_date,
            end_date: end_date,
        });
    } else {
        console.warn('background_port not set');
    }
}

function handleStopClick() {
    if (background_port) {
        background_port.postMessage({action: 'abort'});
    }
}

function init() {
    settings.startMonitoringSettingsStorage();
    settings.initialiseUi();
    console.log('init');
    activateIdle();
    connectToBackground();
    registerActionButtons();
}

$(document).ready( () => init() );

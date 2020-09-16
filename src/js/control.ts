/* Copyright(c) 2019 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

const $ = require('jquery');
import * as analytics from './google_analytics';
import * as settings from './settings';

function activateIdle() {
    console.log('activateIdle');
    showOnly(['azad_clear_cache', 'azad_hide_controls']);
    console.log('hello world');
}

function activateScraping(years: number[]) {
    console.log('activateScraping');
    showOnly(['azad_stop', 'azad_hide_controls']);
    $('#azad_state').text('scraping ' + years.join(','));
}

function activateDone(years: number[]) {
    console.log('activateDone');
    showOnly(['azad_clear_cache', 'azad_hide_controls']);
    $('#azad_state').text(years.join(','));
}

function showOnly(button_ids: any[]) {
    $('.azad_action').addClass('hidden');
    button_ids.forEach( id => $('#' + id).removeClass('hidden') ); 
}

let background_port: chrome.runtime.Port = null;
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
            case 'statistics_update':
                {
                    const text = Object.entries(msg.statistics)
                        .map(([k,v]) => {return k + ':' + v;})
                        .join('; ');
                    $('#azad_statistics').text(text);
                    if ((msg.statistics.queued + msg.statistics.running) > 0) {
                        activateScraping(msg.years);
                    } else {
                        activateDone(msg.years);
                    }
                }
                break;
            default:
                console.warn('unknown action: ' + msg.action); 
        }
    });
}

function registerActionButtons() {
    $('#azad_clear_cache').on(
        'click',
        () => {
            background_port.postMessage({action: 'clear_cache'});
            window.ga(
                'send',
                {
                    hitType: 'event',
                    eventCategory: 'control',
                    eventAction: 'clear_cache_click',
                    eventLabel: ''
                }
            );
        }
    );
    $('#azad_stop').on('click', () => handleStopClick());
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
            '<input type="button" class="azad_year_button" value="' + year + '" />'
        );
    });
    $('.azad_year_button').on('click', handleYearClick);
    
}

declare global {
    interface Window {
        ga(action: string, data: any) : void;
    }
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
    window.ga(
        'send',
        {
            hitType: 'event',
            eventCategory: 'control',
            eventAction: 'scrape_year_click',
            eventLabel: 'scrape_year_click:' + year
        }
    );
}

function handleStopClick() {
    background_port.postMessage({action: 'abort'});
}

function init() {
    settings.initialiseUi();
    console.log('init');
    activateIdle();
    connectToBackground();
    registerActionButtons();
}

$(document).ready( () => init() );

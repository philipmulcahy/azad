/* Copyright(c) 2019 Philip Mulcahy. */

'use strict';

const $ = require('jquery');

import * as analytics from './google_analytics';
import * as settings from './settings';

analytics.init();

function activateIdle() {
    console.log('activateIdle');
    showOnly(['azad_clear_cache', 'azad_force_logout', 'azad_hide_controls']);
    console.log('hello world');
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

function sendGAButtonClick(action: string) {
    window.ga(
        'send',
        {
            hitType: 'event',
            eventCategory: 'control',
            eventAction: action,
            eventLabel: ''
        }
    );
}

function registerActionButtons() {
    $('#azad_clear_cache').on('click', () => {
        if (background_port) {
            console.log('clear cache clicked');
            background_port.postMessage({action: 'clear_cache'});
            sendGAButtonClick('clear_cache');
        } else {
            console.warn('clear cache clicked, but I have no background port');
        }
    });
    $('#azad_force_logout').on('click', () => {
        console.log('force logout clicked');
        if (background_port) {
            console.log('force logout clicked');
            background_port.postMessage({action: 'force_logout'});
            sendGAButtonClick('force_logout');
        } else {
            console.log('force logout clicked, but I have no background port');
        }
    });
    $('#azad_stop').on('click', () => {
        console.log('stop clicked');
        handleStopClick();
        sendGAButtonClick('stop_scraping');

    });
    $('#azad_hide_controls').on('click', () => {
        console.log('closing popup');
        sendGAButtonClick('close_popup');
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
    if (background_port) {
        background_port.postMessage({action: 'abort'});
    }
}

function init() {
    settings.initialiseUi();
    console.log('init');
    activateIdle();
    connectToBackground();
    registerActionButtons();
}

$(document).ready( () => init() );

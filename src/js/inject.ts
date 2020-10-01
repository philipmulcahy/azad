/* Copyright(c) 2016-2020 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

import * as util from './util';
import * as request_scheduler from './request_scheduler';
import * as azad_order from './order';
import * as azad_table from './table';

let scheduler: request_scheduler.IRequestScheduler = null;
let background_port: chrome.runtime.Port = null;
let years: number[] = null;
let stats_timeout: NodeJS.Timeout = null;

const SITE = window.location.href.match( /\/\/([^/]*)/ )[1];

function getScheduler(): request_scheduler.IRequestScheduler {
    if (!scheduler) {
        resetScheduler();
    }
    return scheduler;
}

function getBackgroundPort() {
    return background_port;
}

function setStatsTimeout() {
    const sendStatsMsg = () => {
        getBackgroundPort().postMessage({
            action: 'statistics_update',
            statistics: getScheduler().statistics(),
            years: years,
        });
    }
    clearTimeout(stats_timeout);
    stats_timeout = setTimeout(
        () => {
            setStatsTimeout();
            sendStatsMsg();
        },
        2000
    ); 
}

function resetScheduler(): void {
    if (scheduler) {
        scheduler.abort();
    }
    scheduler = request_scheduler.create();
    setStatsTimeout();
}

let cached_years: Promise<number[]> = null;

function getYears(): Promise<number[]> {
    const getPromise = function(): Promise<number[]> {
        const url = 'https://' + SITE + '/gp/css/order-history?ie=UTF8&ref_=nav_youraccount_orders';
        return fetch(url).then( response => response.text() )
                         .then( text => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(
                text, 'text/html'
            );
            const snapshot = util.findMultipleNodeValues(
                '//select[@name="orderFilter"]/option[@value]',
                doc.documentElement
            );
            const years = snapshot.map(
                elem => elem.textContent
                            .replace('en', '')  // amazon.fr
                            .replace('nel', '')  // amazon.it
                            .trim()
            ).filter( element => (/^\d+$/).test(element) )
             .map( (year_string: string) => Number(year_string) )
             .filter( year => (year >= 2004) );
            return years;
        });
    }
    if(cached_years == null) {
        console.log('getYears() needs to do something');
        cached_years = getPromise();
    }
    console.log('getYears() returning ', cached_years);
    return cached_years;
}

function fetchAndShowOrders(years: number[]): void {
    if ( document.visibilityState != 'visible' ) {
        console.log(
            'fetchAndShowOrders() returning without doing anything: ' +
            'tab is not visible'
        );
        return;
    }
    resetScheduler();
    getYears().then(
        all_years => azad_order.getOrdersByYear(
            years,
            getScheduler(),
            all_years[0]
        )
    ).then(
        orderPromises => {
            let beautiful = true;
            if (orderPromises.length >= 500) {
                beautiful = false;
                alert('Amazon Order History Reporter Chrome Extension\n\n' +
                      '500 or more orders found. That\'s a lot!\n' +
                      'We\'ll start you off with a plain table to make display faster.\n' +
                      'You can click the blue "datatable" button to restore sorting, filtering etc.');
            }
            azad_table.displayOrders(orderPromises, beautiful, false);
            return document.querySelector('[id="azad_order_table"]');
        }
    );
}

function advertiseYears() {
    getYears().then( years => {
        console.log('advertising years', years);
        getBackgroundPort().postMessage({
            action: 'advertise_years',
            years: years
        });
    });
}

function registerContentScript() {
    background_port = chrome.runtime.connect(null, {name: 'azad_inject'});
    getBackgroundPort().onMessage.addListener( msg => {
        switch(msg.action) {
            case 'dump_order_detail':
                azad_table.dumpOrderDiagnostics(msg.order_id)
                break;
            case 'scrape_years':
                years = msg.years;
                fetchAndShowOrders(years);
                break;
            case 'clear_cache':
                getScheduler().clearCache();
                alert('Amazon Order History Reporter Chrome Extension\n\n' +
                      'Cache cleared');
                break;
            case 'abort':
                resetScheduler();
                break;
            default:
                console.warn('unknown action: ' + msg.action);
        }
    } );
    console.log('script registered');
}

console.log('Amazon Order History Reporter starting');
registerContentScript();
advertiseYears();

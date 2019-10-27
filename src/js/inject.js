/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

import util from './util';
import request_scheduler from './request_scheduler';
import azad_order from './order';
import azad_table from './table';

let scheduler = null;
let background_port = null;
let years = null;
let stats_timeout = null;

function getScheduler() {
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

function resetScheduler() {
    if (scheduler) {
        scheduler.abort();
    }
    scheduler = request_scheduler.create();
    setStatsTimeout();
}

function getYears() {
    if(typeof(getYears.years) === 'undefined') {
        console.log('getYears() needs to do something');
        const snapshot = util.findMultipleNodeValues(
            '//select[@name="orderFilter"]/option[@value]',
            document.documentElement
        );
        getYears.years = snapshot.map(
            elem => elem.textContent
                        .replace('en', '')  // amazon.fr
                        .replace('nel', '')  // amazon.it
                        .trim()
        )
        .filter( element => (/^\d+$/).test(element) )
        .filter( year => (year >= '2004') );
    }
    console.log('getYears() returning ', getYears.years);
    return getYears.years;
}

function fetchAndShowOrders(years) {
    resetScheduler();
    azad_order.getOrdersByYear(
        years,
        getScheduler(),
        getYears()[0]
    ).then(
        orderPromises => {
            let beautiful = true;
            if (orderPromises.length >= 500) {
                beautiful = false;
                alert('500 or more orders found. That\'s a lot! We\'ll start you off with a plain table to make display faster. You can click the blue "datatable" button to restore sorting, filtering etc.');
            }
            azad_table.displayOrders(orderPromises, beautiful);
            return document.querySelector('[id="order_table"]');
        }
    );
}

function advertiseYears() {
    const years = getYears();
    console.log('advertising years', years);
    getBackgroundPort().postMessage({
        action: 'advertise_years',
        years: years
    });
}

function registerContentScript() {
    background_port = chrome.runtime.connect(null, {name: 'azad_inject'});
    getBackgroundPort().onMessage.addListener( msg => {
        switch(msg.action) {
            case 'dump_order_detail':
                azad_table.dumpOrderDiagnostics(msg.order_detail_url)
                break;
            case 'scrape_years':
                years = msg.years;
                fetchAndShowOrders(years);
                break;
            case 'clear_cache':
                getScheduler().clearCache();
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

function addPopupButton() {
    util.addButton(
        'where have my order history buttons gone?',
        () => {
            window.alert(
                'You can get to the controls popup by clicking on the extension icon at the top right of the Chrome window:  Look for an orange upper case A. The button that you have just clicked will be removed in a future version of the order history extension.'
            );
        }
    );
}

console.log('Amazon Order History Reporter starting');
registerContentScript();
advertiseYears();
addPopupButton();

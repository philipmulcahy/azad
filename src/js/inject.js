/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

import util from './util';
import request_scheduler from './request_scheduler';
import azad_order from './order';
import azad_table from './table';

const scheduler = request_scheduler.create();

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
    azad_order.getOrdersByYear(
        years,
        scheduler,
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

function addInfoPoints() {
    const progress = document.createElement('div');
    progress.setAttribute('id', 'order_reporter_progress');
    progress.setAttribute('class', 'order_reporter_progress');
    progress.setAttribute(
        'style',
        'position:absolute; top:0; right:0; color:orange; padding:0.2em; font-size:75%; z-index:-1;');
    document.body.insertBefore(
        progress,
        document.body.firstChild
    );
}

function advertiseYears() {
    const years = getYears();
    console.log('advertising years', years);
    background_port.postMessage({
        action: 'advertise_years',
        years: years
    });
}

let background_port = null;

function registerContentScript() {
    background_port = chrome.runtime.connect(null, {name: 'azad_inject'});
    background_port.onMessage.addListener( msg => {
        switch(msg.action) {
            case 'dump_order_detail':
                azad_table.dumpOrderDiagnostics(msg.order_detail_url)
                break;
            case 'scrape_years':
                fetchAndShowOrders(msg.years);
                break;
            case 'clear_cache':
                scheduler.clearCache();
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
addInfoPoints();

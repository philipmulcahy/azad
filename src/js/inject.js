/* Copyright(c) 2019 Philip Mulcahy. */
/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

import util from './util';
import request_scheduler from './request_scheduler';
import azad_order from './order';
import azad_table from './table';

const scheduler = request_scheduler.create();

// Check current page for a Years filter; if exists, pull the years from it.
// Used by: fetchAndShowOrders and addYearButtons.
function getYears() {
    if(typeof(getYears.years) === 'undefined') {
        const snapshot = util.findMultipleNodeValues(
            '//select[@name="orderFilter"]/option[@value]',
            document.documentElement
        );
        getYears.years = snapshot.map( elem => {
            return elem.textContent
                       .replace('en', '')  // amazon.fr
                       .replace('nel', '')  // amazon.it
                       .trim();
        }).filter( element => {
            return(/^\d+$/).test(element);
        }).filter( year => (year >= '2004') );
    }
    console.log('getYears() returning ', getYears.years);
    return getYears.years;
}

// Pressing a  year button calls this function with the year(s).
function fetchAndShowOrders(years) {
console.log("fetchAndShowOrders", years);
    azad_order.getOrdersByYear(
        years,
        scheduler,
        getYears()[0]
    ).then(
        orderPromises => {
            let beautiful = true;
            if (orderPromises.length >= 500) {
                beautiful = false;
                alert('Amazon Order History Reporter Chrome Extension\n\n' +
                      orderPromises.length + ' orders found. Since that\'s a lot, we\'ll start you off with a plain table to make display faster. You can click the blue "datatable" button to restore sorting, filtering etc.');
            }
            azad_table.displayOrders(orderPromises, beautiful);
            return document.querySelector('[id="azad_order_table"]');
        }
    );
}

function addYearButtons() {
    console.log('addYearButtons starting');
    const years = getYears();
    if(years.length > 0) {
        util.addButton(
            'All years',
            () => {
                fetchAndShowOrders(years);
            }
        );
    } else {
        console.log('addYearButtons no years found');
    }
    years.forEach( year => {
        util.addButton(
            [year],
            () => {
                fetchAndShowOrders([year]);
            }
        );
    });
}

function addClearCacheButton() {
    util.addButton(
        'clear cache',
        () => {
            scheduler.clearCache();
        }
    );
}

// Add progress to right of buttons
function addInfoPoints() {
    const progress = document.createElement('div');
    progress.setAttribute('id', 'azad_order_reporter_progress');
    progress.setAttribute('class', 'azad_order_reporter_progress');
    progress.setAttribute(
        'style',
        'position:absolute; top:0; right:0; color:orange; padding:0.2em; font-size:75%; z-index:-1;');
    document.body.insertBefore(
        progress,
        document.body.firstChild
    );
}

function registerContentScript() {
    const background_port = chrome.runtime.connect();
    background_port.onMessage.addListener(
        msg => azad_table.dumpOrderDiagnostics(msg.order_detail_url)
    );
}

console.log('Amazon Order History Reporter starting');
addYearButtons();
addClearCacheButton();
addInfoPoints();
registerContentScript();

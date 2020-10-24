/* Copyright(c) 2016-2020 Philip Mulcahy. */

'use strict';

import * as azad_order from './order';
import * as azad_table from './table';
import * as notice from './notice';
import * as request_scheduler from './request_scheduler';
import * as signin from './signin';
import * as stats from './statistics';
import * as urls from './url';
import * as util from './util';

let scheduler: request_scheduler.IRequestScheduler | null = null;
let background_port: chrome.runtime.Port | null = null;
let years: number[] = [];
let stats_timeout: NodeJS.Timeout | null = null;

const SITE: string = urls.getSite();

function getScheduler(): request_scheduler.IRequestScheduler {
    if (!scheduler) {
        resetScheduler();
    }
    return scheduler!;
}

function getBackgroundPort() {
    return background_port;
}

function setStatsTimeout() {
    const sendStatsMsg = () => {
        const bg_port = getBackgroundPort();
        if (bg_port) {
            stats.publish(bg_port, years); 
            azad_table.updateProgressBar();
        }
    }
    if (stats_timeout) {
        clearTimeout(stats_timeout);
    }
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

let cached_years: Promise<number[]> | null = null;

function getYears(): Promise<number[]> {
    const getPromise = function(): Promise<number[]> {
        const url = 'https://' + SITE + '/gp/css/order-history?ie=UTF8&ref_=nav_youraccount_orders';
        return signin.checkedFetch(url)
        .then( response => response.text() )
        .then( text => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(
                text, 'text/html'
            );
            const snapshot = util.findMultipleNodeValues(
                '//select[@name="orderFilter"]/option[@value]',
                doc.documentElement
            );
            const years = snapshot
             .filter( elem => elem )
             .filter( elem => elem.textContent )
             .map(
                elem => elem!.textContent!
                             .replace('en', '')  // amazon.fr
                             .replace('nel', '')  // amazon.it
                             .trim()
            ).filter( element => (/^\d+$/).test(element) )
             .map( (year_string: string) => Number(year_string) )
             .filter( year => (year >= 2004) );
            return years;
        });
    }
    if(!cached_years) {
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
                notice.showNotificationBar(
                    '500 or more orders found. That\'s a lot!\n' +
                    'We\'ll start you off with a plain table to make display faster.\n' +
                    'You can click the blue "datatable" button to restore sorting, filtering etc.',
                    document
                );
            }
            azad_table.displayOrders(orderPromises, beautiful, false);
            return document.querySelector('[id="azad_order_table"]');
        }
    );
}

function advertiseYears() {
    getYears().then( years => {
        console.log('advertising years', years);
        const bg_port = getBackgroundPort();
        if (bg_port) {
            bg_port.postMessage({
                action: 'advertise_years',
                years: years
            });
        }
    });
}

function registerContentScript() {
    // @ts-ignore null IS allowed as first arg to connect. 
    background_port = chrome.runtime.connect(null, {name: 'azad_inject'});

    const bg_port = getBackgroundPort();
    if (bg_port) {
        bg_port.onMessage.addListener( msg => {
            try {
                switch(msg.action) {
                    case 'dump_order_detail':
                        azad_table.dumpOrderDiagnostics(msg.order_id)
                        break;
                    case 'scrape_years':
                        years = msg.years;
                        if (years) {
                            fetchAndShowOrders(years);
                        }
                        break;
                    case 'clear_cache':
                        getScheduler().clearCache();
                        notice.showNotificationBar(
                            'Amazon Order History Reporter Chrome' +
                            ' Extension\n\n' +
                            'Cache cleared',
                            document
                        );
                        break;
                    case 'force_logout':
                        signin.forceLogOut('https://' + SITE);
                        break;
                    case 'abort':
                        resetScheduler();
                        break;
                    default:
                        console.warn('unknown action: ' + msg.action);
                }
            } catch (ex) {
                console.error('message handler blew up with ' + ex +
                              ' while trying to process ' + msg);
            }
        } );
    }
    console.log('script registered');
}

console.log('Amazon Order History Reporter starting');
registerContentScript();
advertiseYears();

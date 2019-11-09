/* Copyright(c) 2019 Philip Mulcahy. */
/* jshint strict: true, esversion: 9 */

'use strict';

const fs = require('fs');
import util from '../js/util';
const jsdom = require('jsdom');
const xpath = require('xpath');
import azad_order from '../js/order';

const DATA_ROOT_PATH = './src/tests/data';

class FakeRequestScheduler {
    constructor(url_html_map) {
        this.url_html_map = url_html_map;
    }

    schedule(query, event_converter, callback, priority, nocache) {
        setTimeout( () => {
            const html = this.url_html_map[query];
            const fake_evt = {
                target: {
                    responseText: html
                }
            };
            const converted = event_converter(fake_evt);
            callback(converted);
        } );
    }
}

function orderFromTestData(
    order_id,
    collection_date,
    site
) {
    const path = DATA_ROOT_PATH + '/' + site + '/input/' + order_id + '_' + collection_date + '.json';
    const json_promise = new Promise( (resolve, reject) => {
        fs.readFile(path, 'utf8', (err, json) => {
            if (err) {
                reject(err);
            } else {
                resolve(json)
            }
        })
    });
    const dump_promise = json_promise.then( json => JSON.parse(json) );
    return dump_promise.then( order_dump => {
        const url_map = {};
        url_map[order_dump.list_url] = order_dump.list_html;
        url_map[order_dump.detail_url] = order_dump.detail_html;
        url_map[order_dump.invoice_url] = order_dump.invoice_html;
        const scheduler = new FakeRequestScheduler( url_map );
        const list_doc = new jsdom.JSDOM(order_dump.list_html).window.document;
        const order_elems = util.findMultipleNodeValues(
            './/*[contains(concat(" ", ' +
                'normalize-space(@class), ' +
                '" "), ' +
                '" order ")]',
            list_doc.body
        );
        const list_elem = order_elems.filter(
            el => Array(...el.getElementsByTagName('a'))
                .filter( el => el.hasAttribute('href') )
                .map( el => el.getAttribute('href') )
                .map( href => href.match(/.*orderID=([A-Z0-9-]*).*/) )
                .filter( match => match )[0][1] == order_dump.id
        )[0];
        return azad_order.create(
            list_elem,
            scheduler,
            order_dump.list_url
        );
    });
}

function expectedFromTestData(
    order_id,
    collection_date,
    site
) {
    const path = DATA_ROOT_PATH + '/' + site + '/expected/' + order_id + '_' + collection_date + '.json';
    const json_promise = new Promise( (resolve, reject) => {
        fs.readFile(path, 'utf8', (err, json) => {
            if (err) {
                reject(err);
            } else {
                resolve(json)
            }
        })
    });
    return json_promise.then( json => JSON.parse(json) );
}

function discoverTestData() {
    const sites_promise = fs.promises.readdir(DATA_ROOT_PATH);
    return sites_promise.then( sites => {
        const expected_promises = [];
        const site_to_expecteds = {}
        sites.forEach( site => {
            const expected_promise = fs.promises.readdir(DATA_ROOT_PATH + '/' + site + '/expected');
            expected_promises.push(expected_promise);
            expected_promise.then( expecteds => {
                site_to_expecteds[site] = expecteds;
            });
        } );
        return Promise.all(
            expected_promises
        ).then( () => {
            const test_targets = [];
            Object.keys(site_to_expecteds).sort().forEach( site => {
                const expecteds = site_to_expecteds[site];
                expecteds
                    .filter( e => e.match(/8755888/) )
                    .sort()
                    .filter( e => e.match(/.*\.json$/) )
                    .forEach( expected => {
                        const target = {
                            site: site,
                            order_id: expected.match(/^([A-Z0-9-]*)_.*\.json/)[1], 
                            scrape_date: expected.match(/^.*_(\d\d\d\d-\d\d-\d\d).json$/)[1],
                        };
                        target.input_path = DATA_ROOT_PATH + '/' + site + + '/input/' + expected;
                        target.expected_path = DATA_ROOT_PATH + '/' + site + '/expected/' + expected;
                        test_targets.push(target); 
                    });
            } );
            return test_targets;
        } );
    } );
}

export default {
    discoverTestData: discoverTestData,
    orderFromTestData: orderFromTestData,
    expectedFromTestData: expectedFromTestData,
};

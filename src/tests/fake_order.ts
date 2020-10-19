/* Copyright(c) 2019-2020 Philip Mulcahy. */

'use strict';

const fs = require('fs');
import * as util from '../js/util';
const jsdom = require('jsdom');
const xpath = require('xpath');
import * as azad_order from '../js/order';
import * as request_scheduler from '../js/request_scheduler';

const DATA_ROOT_PATH = './src/tests/azad_test_data/data';

class FakeRequestScheduler {

    url_html_map: Record<string, string>;

    constructor(url_html_map: Record<string,string>) {
        this.url_html_map = url_html_map;
    }

    scheduleToPromise<T>(
        query: string,
        event_converter: (evt: any) => any,
        priority: string,
        nocache: boolean
    ): Promise<request_scheduler.IResponse<T>> {
        return new Promise<any> ( resolve => {
            setTimeout( () => {
                const html = this.url_html_map[query];
                if (!html) {
                    const msg = 'could not find ' + query +
                                ' in url_html_map whose keys are: ' +
                                Object.keys(this.url_html_map);
                    console.error(msg);
                }
                const fake_evt = {
                    target: {
                        responseText: html
                    }
                };
                const converted = event_converter(fake_evt);
                resolve({result:converted, query:query});
            });
        });
    }

    abort(): void {}
    clearCache(): void {}
    statistics(): Record<string, number> { return null; }
    isLive(): boolean { return null; }
}

export function orderFromTestData(
    order_id: string,
    collection_date: string,
    site: string
): Promise<azad_order.IOrder> {
    const path = DATA_ROOT_PATH + '/' + site + '/input/' + order_id + '_' +
                 collection_date + '.json';
    const json_promise: Promise<string> = new Promise( (resolve, reject) => {
        fs.readFile(path, 'utf8', (err: string, json: string) => {
            if (err) {
                reject(err);
            } else {
                resolve(json)
            }
        })
    });
    const dump_promise = json_promise.then( json => JSON.parse(json) );
    return dump_promise.then( order_dump => {
        const url_map: Record<string, string>  = {};
        url_map[order_dump.list_url] = order_dump.list_html;
        url_map[order_dump.detail_url] = order_dump.detail_html;
        url_map[order_dump.payments_url] = order_dump.invoice_html;
        const scheduler = new FakeRequestScheduler( url_map );
        const list_doc = new jsdom.JSDOM(order_dump.list_html).window.document;
        const order_elems = util.findMultipleNodeValues(
            './/*[contains(concat(" ", normalize-space(@class), " "), " order ")]',
            list_doc.body
        );
        const list_elem: HTMLElement = <HTMLElement>(order_elems.filter(
            (el: HTMLElement) => Array(...el.getElementsByTagName('a'))
                .filter( el => el.hasAttribute('href') )
                .map( el => el.getAttribute('href') )
                .map( href => href.match(/.*orderID=([A-Z0-9-]*).*/) )
                .filter( match => match )[0][1] == order_dump.id
        )[0]);
        return azad_order.create(
            list_elem,
            scheduler,
            order_dump.list_url
        );
    });
}

export function expectedFromTestData(
    order_id: string,
    collection_date: string,
    site: string
) {
    const path = DATA_ROOT_PATH + '/' + site + '/expected/' + order_id + '_' + collection_date + '.json';
    const json_promise: Promise<string> = new Promise( (resolve, reject) => {
        fs.readFile(path, 'utf8', (err: string, json: string) => {
            if (err) {
                reject(err);
            } else {
                resolve(json)
            }
        })
    });
    return json_promise.then( json => JSON.parse(json) );
}

export class ITestTarget {
    site: string;
    order_id: string;
    scrape_date: string;
    input_path: string;
    expected_path: string;
}

export function discoverTestData(): Promise<ITestTarget[]> {
    const sites_promise: Promise<string[]> = fs.promises.readdir(DATA_ROOT_PATH);
    sites_promise.then(sites => console.log('expected sites:' , sites));
    return sites_promise.then( sites => {

        // We don't care what's inside these promises:
        // we just want to know when they're  all resolved.
        const expected_promises: Promise<any>[] = [];

        // This is the data we want: site name to list of filenames.
        // The filenames each encode an order id and a scrape datetime.
        const site_to_expecteds: Record<string,string[]> = {}
        sites
            .filter( site => site[0] != '.' )  // ignore hidden files/folders
            .forEach( (site: string) => {
                const expected_promise: Promise<string[]>
                    = fs.promises.readdir(
                        DATA_ROOT_PATH + '/' + site + '/expected'
                    );
                expected_promises.push(expected_promise);
                expected_promise.then( expecteds =>
                    expecteds.forEach( expected => {
                        console.log('expected order:', site, expected);
                    })
                );
                expected_promises.push(expected_promise);
                expected_promise.then( (expecteds: string[]) => {
                    site_to_expecteds[site] = expecteds.filter(
                        exp => exp.match(/^[^.].*\.json$/)
                    );
                });
            } );
        return Promise.all(  // Wait for all of the promises to resolve.
            expected_promises
        ).then( () => {
            const test_targets: ITestTarget[] = [];
            Object.keys(site_to_expecteds).sort().forEach( site => {
                const expecteds = site_to_expecteds[site];
                expecteds
                    /* .filter( e => e.match(/9651082/) ) */
                    .sort()
                    .filter( e => e.match(/^[^.].*\.json$/) )
                    .forEach( expected => {
                        const target: ITestTarget = {
                            site: site,
                            order_id: expected.match(
                                /^([A-Z0-9-]*)_.*\.json/
                            )[1],
                            scrape_date: expected.match(
                                /^.*_(\d\d\d\d-\d\d-\d\d).json$/
                            )[1],
                            input_path: DATA_ROOT_PATH + '/' + site +
                                        '/input/' + expected,
                            expected_path: DATA_ROOT_PATH + '/' + site +
                                           '/expected/' + expected,
                        };
                        test_targets.push(target);
                    });
            } );
            return test_targets;
        } );
    } );
}

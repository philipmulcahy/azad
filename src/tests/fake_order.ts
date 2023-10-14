/* Copyright(c) 2019-2020 Philip Mulcahy. */

'use strict';

import * as fs from 'fs';
import * as util from '../js/util';
const jsdom = require('jsdom');
const xpath = require('xpath');
import * as azad_order from '../js/order';
import * as order_header from '../js/order_header';
import * as request_scheduler from '../js/request_scheduler';

////////////////////////////////////////////////////////////////////////////////
// TEST TYPES:
// -----------
//
// A) Build order from json dump file containing urls and html scraped from real
//    Amazon accounts:
//    json dump file pattern ${SITE}/input/${ORDER_ID}_${DATETIME}.json
//    json file containing expected order fields:
//      ${SITE}/expected/${ORDER_ID}_${DATETIME}.json
//
////////////////////////////////////////////////////////////////////////////////

const DATA_ROOT_PATH = './src/tests/azad_test_data/data';

class FakeRequestScheduler {
    url_html_map: Record<string, string>;

    constructor(url_html_map: Record<string,string>) {
        this.url_html_map = url_html_map;
    }

    purpose(): string { return 'testing'; }

    scheduleToPromise<T>(
        query: string,
        event_converter: (evt: any) => any,
        _priority: string,
        _nocache: boolean
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
    statistics(): Record<string, number> { return {}; }
    isLive(): boolean { return true; }
}

function dirHasDirs(dir: fs.Dirent, dirs: string[]): boolean {
    return fs.readdirSync(
        sitePath(dir.name), {withFileTypes: true}
    ).filter(
        (de: fs.Dirent) => dirs.includes(de.name) && de.isDirectory()
    ).length == dirs.length;
}

function getSiteDirs(): fs.Dirent[] {
    return fs.readdirSync(DATA_ROOT_PATH, {withFileTypes: true})
             .filter((de: fs.Dirent) => de.isDirectory() &&  // directories only
                                        de.name[0] != '.')  // ignore hidden
}

function getASites(): string[] {
    const sites: string[] = getSiteDirs()
        .filter((de: fs.Dirent) => dirHasDirs(de, ['expected', 'input']))
        .map((de: fs.Dirent) => de.name)
    return sites;
}

function sitePath(site: string): string {
    return  DATA_ROOT_PATH + '/' + site;
}

export function orderFromTestData(
    order_id: string,
    collection_date: string,
    site: string
): azad_order.IOrder {
    const path = sitePath(site) + '/input/' + order_id + '_' +
                 collection_date + '.json';
    const json: string = fs.readFileSync(path, 'utf8');
    const order_dump = JSON.parse(json);
    const url_map: Record<string, string> = {};
    url_map[order_dump.list_url] = order_dump.list_html;
    url_map[order_dump.detail_url] = order_dump.detail_html;
    url_map[order_dump.payments_url] = order_dump.invoice_html;
    const scheduler = new FakeRequestScheduler( url_map );
    const list_doc = new jsdom.JSDOM(order_dump.list_html).window.document;
    const order_elems = util.findMultipleNodeValues(
        './/*[contains(concat(" ", normalize-space(@class), " "), " order ")]',
        list_doc.body
    );
    const list_elem: HTMLElement = <HTMLElement>(
        (order_elems as HTMLElement[]).filter(
            (el: HTMLElement) => {
                try {
                    return Array(...el.getElementsByTagName('a'))
                        .filter( el => el.hasAttribute('href') )
                        .map( el => el.getAttribute('href') )
                        .map( href => href?.match(/.*orderID=([A-Z0-9-]*).*/) )
                        .filter( match => match )![0]![1] == order_dump.id

                } catch(ex) {
                    return null
                }
            }
        )[0]
    );
    const header: order_header.IOrderHeader = order_header.extractOrderHeader(
      list_elem,
      order_dump.list_url, 
    );
    const order = azad_order.create(
        header, 
        scheduler,
        (_d: Date|null) => true,  // DateFilter
    );
    if (typeof(order) === 'undefined') {
      throw new Error(
        'null order not expected, but sometimes these things happen');
    }
    return order!;
}

export function expectedFromTestData(
    order_id: string,
    collection_date: string,
    site: string
): Record<string, any> {
    const path = sitePath(site) + '/expected/' + order_id + '_' + collection_date + '.json';
    const json: string = fs.readFileSync(path, 'utf8');
    return JSON.parse(json);
}

export interface ITestTarget {
    site: string;
    order_id: string;
    scrape_date: string;
    input_path: string;
    expected_path: string;
}

export function discoverTestData(): ITestTarget[] {
    const site_to_expecteds: Record<string,string[]> = {}
    getASites()
        .forEach( (site: string) => {
            const expecteds: string[] = fs.readdirSync(
                    sitePath(site) + '/expected');
            expecteds.forEach( expected => {
                console.log('expected order:', site, expected);
            })
            site_to_expecteds[site] = expecteds.filter(
                exp => exp.match(/^[^.].*\.json$/)
            );
        } );
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
                    order_id: expected?.match(
                        /^([A-Z0-9-]*)_.*\.json/
                    )![1] ?? '',
                    scrape_date: expected?.match(
                        /^.*_(\d\d\d\d-\d\d-\d\d).json$/
                    )![1] ?? '',
                    input_path: sitePath(site) +
                                '/input/' + expected,
                    expected_path: sitePath(site) +
                                   '/expected/' + expected,
                };
                test_targets.push(target);
            });
    } );
    return test_targets;
}

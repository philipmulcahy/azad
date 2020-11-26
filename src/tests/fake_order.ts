/* Copyright(c) 2019-2020 Philip Mulcahy. */

'use strict';

import * as fs from 'fs';
import * as util from '../js/util';
const jsdom = require('jsdom');
const xpath = require('xpath');
import * as azad_order from '../js/order';
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
// B) Build order from order_list folder
//
//
////////////////////////////////////////////////////////////////////////////////

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

function dirHasDirs(dir: fs.Dirent, dirs: string[]): boolean {
    return fs.readdirSync(
        sitePath(dir.name), {withFileTypes: true}
    ).filter(
        (de: fs.Dirent) => dirs.includes(de.name) && de.isDirectory()
    ).length == dirs.length;
}

function getSiteDirs(): fs.Dirent[] {
    return fs.readdirSync(DATA_ROOT_PATH, {withFileTypes: true})
             .filter((de: fs.Dirent) => de.isDirectory &&  // directories only
                                        de.name[0] != '.')  // ignore hidden
}

function getASites(): string[] {
    const sites: string[] = getSiteDirs()
        .filter((de: fs.Dirent) => dirHasDirs(de, ['expected', 'input']))
        .map((de: fs.Dirent) => de.name)
    return sites;
}

function getBSites(): string[] {
    const sites: string[] = getSiteDirs()
        .filter((de: fs.Dirent) => dirHasDirs(de, ['order_list']))
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

export function orderFromTestDataB() {
    const order_id = 'D01-9486382-0309461';
    const site = 'amazon.de';
    const path = '/Users/philip/dev/azad/src/tests/azad_test_data/data/amazon.de/order_list/Gu108_A.html';
    const list_url = 'https://unknown_list_url.com';
    const list_html: string = fs.readFileSync(path, 'utf8');
    const url_map: Record<string, string> = {};
    url_map[list_url] = list_html;
    const scheduler = new FakeRequestScheduler( url_map );
    const list_doc = new jsdom.JSDOM(list_html).window.document;
    const order_elems = util.findMultipleNodeValues(
        './/*[contains(concat(" ", normalize-space(@class), " "), " order ")]',
        list_doc.body
    );
    const list_elem: HTMLElement = <HTMLElement>(order_elems.filter(
        (el: HTMLElement) => Array(...el.getElementsByTagName('a'))
            .filter( el => el.hasAttribute('href') )
            .map( el => el.getAttribute('href') )
            // "https://www.amazon.de:443/gp/redirect.html/ref=ppx_yo_dt_b_amzn_o04?_encoding=UTF8&amp;location=https%3A%2F%2Fwww.audible.de%2Forder-detail%3ForderNumber%3DD01-6816308-9691801%26orderType%3DREGULAR&amp;source=standards&amp;token=3DE81B8D696294E017D9EAE857EBCE90E128789D"
            // "/-/en/gp/your-account/order-details/ref=ppx_yo_dt_b_order_details_o03?ie=UTF8&amp;orderID=303-6405422-4189967"
            .map( href => href.match(/.*(?:orderID=|orderNumber%3D)([A-Z0-9-]*).*/) )
            .filter( match => match )[0][1] == order_id
    )[0]);
    return azad_order.create(
        list_elem,
        scheduler,
        list_url
    );
}


export interface ITestTarget {
    site: string;
    order_id: string;
    scrape_date: string;
    input_path: string;
    expected_path: string;
}

export function discoverTestData(): ITestTarget[] {
    // This is the data we want: site name to list of filenames.
    // The filenames each encode an order id and a scrape datetime.
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
                    order_id: expected.match(
                        /^([A-Z0-9-]*)_.*\.json/
                    )[1],
                    scrape_date: expected.match(
                        /^.*_(\d\d\d\d-\d\d-\d\d).json$/
                    )[1],
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

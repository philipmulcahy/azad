/* Copyright(c) 2019-2020 Philip Mulcahy. */

'use strict';

import * as fs from 'fs';
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

function dirHasInputAndExpectedDirs(dir: fs.Dirent): boolean {
    return fs.readdirSync(
        sitePath(dir.name), {withFileTypes: true}
    ).filter(
        (de: fs.Dirent) => ['expected', 'input'].includes(de.name) && de.isDirectory()
    ).length == 2;
}

function getSites(): string[] {
    const sites: string[] = fs
        .readdirSync(DATA_ROOT_PATH, {withFileTypes: true})
        .filter(
            (de: fs.Dirent) => de.isDirectory &&  // directories only
                               de.name[0] != '.' &&  // ignore hidden
                               dirHasInputAndExpectedDirs(de))
        .map((de: fs.Dirent) => de.name)
    console.log('expected sites:' , sites);
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

export class ITestTarget {
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
    getSites()
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

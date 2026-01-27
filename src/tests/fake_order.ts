/* Copyright(c) 2019-2023 Philip Mulcahy. */

'use strict';

import * as azad_order from '../js/order';
import * as extraction from '../js/extraction';
import * as fs from 'fs';
const jsdom = require('jsdom');
import * as order_header from '../js/order_header';
import * as request_scheduler from '../js/request_scheduler';
import * as stats from '../js/statistics';

///////////////////////////////////////////////////////////////////////////////
// TEST TYPES:
// -----------
//
// A) Build order from json dump file containing urls and html scraped from
//    real Amazon accounts:
//    json dump file pattern ${SITE}/input/${ORDER_ID}_${DATETIME}.json
//    json file containing expected order fields:
//      ${SITE}/expected/${ORDER_ID}_${DATETIME}.json
//
///////////////////////////////////////////////////////////////////////////////

const DATA_ROOT_PATH = './src/tests/azad_test_data/data';

function dirHasDirs(dir: fs.Dirent, dirs: string[]): boolean {
  return fs.readdirSync(
    sitePath(dir.name),
    {withFileTypes: true}
  ).filter(
    (de: fs.Dirent) => dirs.includes(de.name) && de.isDirectory()
  ).length == dirs.length;
}

function getSiteDirs(): fs.Dirent[] {
  return fs
    .readdirSync(DATA_ROOT_PATH, {withFileTypes: true})
    .filter((de: fs.Dirent) => de.isDirectory() &&  // directories only
                               de.name[0] != '.');  // ignore hidden
}

function getASites(): string[] {
    const sites: string[] = getSiteDirs()
        .filter((de: fs.Dirent) => dirHasDirs(de, ['expected', 'input']))
        .map((de: fs.Dirent) => de.name);

    return sites;
}

function sitePath(site: string): string {
  return  DATA_ROOT_PATH + '/' + site;
}

const statistics = new stats.Statistics();

export function orderFromTestData(
  order_id: string,
  collection_date: string,
  site: string
): azad_order.IOrder | null {
  const path = sitePath(site) + '/input/' + order_id + '_' +
               collection_date + '.json';

  const json: string = fs.readFileSync(path, 'utf8');
  const order_dump = JSON.parse(json);
  const url_map: request_scheduler.string_string_map = {};
  const cooked_url_map: request_scheduler.string_string_map = {};

  // TODO Contrive a way for www.amazon.com and similar to be replaced with
  //      www.azadexample.com instead of having to hack input JSON files.
  url_map[order_dump.list_url] = order_dump.list_html;
  url_map[order_dump.detail_url] = order_dump.detail_html;
  url_map[order_dump.payments_url] = order_dump.invoice_html;

  cooked_url_map[order_dump.detail_url] = order_dump.detail_html_cooked ?? '';

  ['item_data', 'tracking_data'].forEach( map_type => {
    const data = order_dump[map_type] as Record<string, string>;

    if (data) {
      Object.entries(data).forEach( entry => {
        const url = entry[0];
        const html = entry[1];
        url_map[url] = html;
      });
    }
  });

  const scheduler = request_scheduler.create_overlaid(
    'testing',
    url_map,
    cooked_url_map,
    () => Promise.resolve(null),
    statistics,
  );

  const list_doc = new jsdom.JSDOM(order_dump.list_html).window.document;

  const order_elems_xpath = './/div[contains(concat(" ", normalize-space(@class), " "), "order ") or contains(concat(" ", normalize-space(@class), " "), "order-card ") or @id="orderCard"]';

  const order_elems = extraction.findMultipleNodeValues(
    order_elems_xpath,
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
                      .filter( match => match )![0]![1] == order_dump.id;
              } catch(ex) {
                  return null;
              }
          }
      )[0]
  );

  const header: order_header.IOrderHeader = order_header.extractOrderHeader(
    list_elem,
    order_dump.list_url,
  );

  const order: azad_order.IOrder|null = azad_order.create(
    header,
    scheduler,
    (_d: Date|null) => true,  // DateFilter
  );

  if (typeof(order) === 'undefined') {
    throw new Error(
      'null order not expected, but sometimes these things happen');
  }

  if (typeof(order) === 'undefined') {
    throw new Error(
      'null order not expected, but sometimes these things happen');
  }

  return order;
}

export function expectedFromTestData(
  order_id: string,
  collection_date: string,
  site: string
): Record<string, any> {
  const path = sitePath(site)
             + '/expected/' + order_id + '_' + collection_date + '.json';
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
  const site_to_expecteds: Record<string,string[]> = {};
  getASites()
    .forEach( (site: string) => {
      const expecteds: string[] = fs.readdirSync(
        sitePath(site) + '/expected');

      expecteds.forEach( expected => {
          console.log('expected order:', site, expected);
      });

      site_to_expecteds[site] = expecteds.filter(
        exp => exp.match(/^[^.].*\.json$/)
      );
    } );

  const test_targets: ITestTarget[] = [];

  Object.keys(site_to_expecteds).sort().forEach( site => {
    const expecteds = site_to_expecteds[site];
    expecteds
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
          input_path: sitePath(site) + '/input/' + expected,
          expected_path: sitePath(site) + '/expected/' + expected,
        };
        test_targets.push(target);
      });
  } );

  return test_targets;
}

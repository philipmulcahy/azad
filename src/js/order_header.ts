/* Copyright(c) 2023 Philip Mulcahy. */

import * as date from './date';
import * as extraction from './extraction';
import * as sprintf from 'sprintf-js';
import * as urls from './url';
import * as util from './util';

export interface IOrderHeader {
  id: string;
  date: Date|null;
  site: string;
  list_url: string;
  detail_url: string;
  payments_url: string;
  total: string|null;
  who: string|null;
}

export function extractOrderHeader(
  elem: HTMLElement,
  list_url: string
): IOrderHeader {
  try {
    const header = reallyExtractOrderHeader(elem, list_url);
    return header;
  } catch (ex) {
    console.error('extractOrderHeader caught ', ex);
    throw ex;
  }
}

function reallyExtractOrderHeader(
  elem: HTMLElement,
  list_url: string
): IOrderHeader {

  const id = function(): string {
    const strategy0 = function(): string {
      const id = [
          ...Array.prototype.slice.call(elem.getElementsByTagName('a'))
      ].filter( el => el.hasAttribute('href') )
       .map( el => el.getAttribute('href') )
       .map( href => href.match(/.*(?:orderID=|orderNumber%3D)([A-Z0-9-]*).*/) )
       .filter( match => match )[0][1];

      return id.toString();
    }

    const strategy1 = function(): string|null {
      const id_node: Node = extraction.findSingleNodeValue(
        './/a[contains(@class, "a-button-text") and contains(@href, "orderID=")]/text()[normalize-space(.)="Order details"]/parent::*',
        elem,
        'unknown order id',
      );

      const id_elem: HTMLElement = <HTMLElement>id_node;
      const more_than_id: string|null = id_elem.getAttribute('href');

      if (more_than_id) {
        const match = more_than_id.match(/.*orderID=([^?]*)/);
        if (match && match.length > 1) {
          return match[1];
        }
      }

      return null;
    }

    const strategy2 = function(): string|null {
      const id_node = extraction.findSingleNodeValue(
        './/div[contains(@class, "yohtmlc-order-id")]/span[@dir="ltr"]',
        elem,
        '2025 order id',
      );

      const id = id_node.textContent;
      return id;
    }

    const id = extraction.firstMatchingStrategy(
      [strategy0, strategy1, strategy2],
      '???-???????-???????',
    );

    return id ?? '???';
  }();

  const context = 'id:' + id;

  const d: Date = function(): Date {
    const labels =  [
      'Commande effectuée',
      'Order placed',
      'Ordine effettuato',
      'Pedido realizado',
      'Subscription Charged on',
    ];

    function strategy0(): Date {
      const xpaths = labels.map(
        label => `.//div[contains(span,"${label}")]/../div/span[contains(@class,"value") or contains(@class,"a-size-base")]`,
      );

      const raw = extraction.getField2(xpaths, elem, '', context);
      const ddd = new Date(date.normalizeDateString(util.defaulted(raw, '')));
      return ddd;
    }

    function strategy1(): Date {
      const xpaths = labels.map(label => `.//div[contains(text(), "${label}")]/following-sibling::div`);
      const raw = extraction.getField2(xpaths, elem, '', context);
      const ddd = new Date(date.normalizeDateString(util.defaulted(raw, '')));
      return ddd;
    }

    const dd: Date = extraction.firstMatchingStrategy<Date>(
      [strategy0, strategy1],
      new Date('invalid'),
    );

    return dd;
  }();

  const site = function(): string {
    if (list_url) {
      const list_url_match = list_url.match(
        RegExp('.*//([^/]*)'));
      if (list_url_match) {
        return util.defaulted(list_url_match[1], '');
      }
    }
    return '';
  }();

  const detail_url = function(): string {
    let detail_url: string = '';

    if (id && site) {
      detail_url = urls.orderDetailUrlFromListElement(elem, id, site);
    }

    return detail_url;
  }();

  const payments_url = function(): string {
    let payments_url: string = '';

    if (id && site) {
      payments_url = urls.getOrderPaymentUrl(id, site);
    }

    return payments_url;
  }();

  // This field is no longer always available, particularly for .com
  // We replace it (where we know the search pattern for the country)
  // with information from the order detail page.
  const total = extraction.getField2(
    ['.//div[contains(span,"Total")]/../div/span[contains(@class,"value")]'],
    elem,
    '',
    context
  );

  console.debug('total direct:', total);

  const who = extraction.getField2(
    ['.//div[contains(@class,"recipient")]//span[@class="trigger-text"]'],
    elem,
    '',
    context,
  );

  return {
    id: id,
    date: d,
    site: site,
    list_url: list_url,
    detail_url: detail_url,
    payments_url: payments_url,
    total: total,
    who: who,
  };
}

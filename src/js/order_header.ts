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
  let id: string = 'UNKNOWN_ORDER_ID';
  try {
    id = [
        ...Array.prototype.slice.call(elem.getElementsByTagName('a'))
    ].filter( el => el.hasAttribute('href') )
     .map( el => el.getAttribute('href') )
     .map( href => href.match(/.*(?:orderID=|orderNumber%3D)([A-Z0-9-]*).*/) )
     .filter( match => match )[0][1];
     if (!id) {
       const id_node: Node = extraction.findSingleNodeValue(
         '//a[contains(@class, "a-button-text") and contains(@href, "orderID=")]/text()[normalize-space(.)="Order details"]/parent::*',
         elem,
         'unknown order id',
       );
       const id_elem: HTMLElement = <HTMLElement>id_node;
       const more_than_id: string|null = id_elem.getAttribute('href');
       if (more_than_id) {
         const match = more_than_id.match(/.*orderID=([^?]*)/);
         if (match && match.length > 1) {
           id = match[1];
         }
       }
     }
  } catch (error) {
    console.warn('could not parse order id from order list page');
    throw error;
  }
  const context = 'id:' + id;
  let d: Date|null = null;
  try {
    d = new Date(
      date.normalizeDateString(
        util.defaulted(
          extraction.getField(
              [
                  'Commande effectuée',
                  'Order placed',
                  'Ordine effettuato',
                  'Pedido realizado'
              ].map(
                  label => sprintf.sprintf(
                      './/div[contains(span,"%s")]' +
                      '/../div/span[contains(@class,"value")]',
                      label
                  )
              ).join('|'),
              elem,
              context,
          ),
          ''
        )
      )
    );
  } catch (ex) {
    console.warn('could not get order date for ' + id);
    throw ex;
  }

  const site: string = function() {
      if (list_url) {
          const list_url_match = list_url.match(
              RegExp('.*//([^/]*)'));
          if (list_url_match) {
              return util.defaulted(list_url_match[1], '');
          }
      }
      return '';
  }();
        
        
  let detail_url: string = '';
  let payments_url: string = '';
  if (id && site) {
      detail_url = urls.orderDetailUrlFromListElement(
          elem, id, site
      );
      payments_url = urls.getOrderPaymentUrl(id, site);
  }
        
  // This field is no longer always available, particularly for .com
  // We replace it (where we know the search pattern for the country)
  // with information from the order detail page.
  const total = extraction.getField('.//div[contains(span,"Total")]' +
      '/../div/span[contains(@class,"value")]', elem, context);
  console.debug('total direct:', total);

  const who = extraction.getField('.//div[contains(@class,"recipient")]' +
      '//span[@class="trigger-text"]', elem, context);

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

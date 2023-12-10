/* Copyright(c) 2023 Philip Mulcahy. */

import * as item from './item';
import * as extraction from './extraction';
import * as order_header from './order_header';
import * as url from './url';
import * as util from './util';

export interface ITransaction {
  payment_amount: string;
  info_string: string;
}

export enum Delivered {
  YES = 1,
  NO,
  UNKNOWN,
}

export interface IShipment {
  items: item.IItem[],
  delivered: Delivered;
  status: string;
  tracking_link: string;
  transaction: ITransaction|null
}

export function get_shipments(
  order_detail_doc: HTMLDocument,
  _url: string,  // for debugging
  order_header: order_header.IOrderHeader,
  context: string,
): IShipment[] {
  const doc_elem = order_detail_doc.documentElement;
  const transactions = get_transactions(order_detail_doc);

  const candidates = extraction.findMultipleNodeValues(
		"//div[contains(@class, 'shipment')]",
		doc_elem);

  // We want elem to have 'shipment' as one of its classes
  // not just have one of its classes _contain_ 'shipment' in its name.
  // There may be a way to do this in xpath, but it wouldn't be very
  // readable, and I am also a bit short on sleep.
  const elems = candidates.filter(
    elem => {
      const cs: string = util.defaulted(
        (elem as HTMLElement)!.getAttribute('class'), '');
        const classes: string[] = cs.split(' ');
        return classes.includes('shipment');
    });

  const shipments = elems.map(e => shipment_from_elem(
    e as HTMLElement,
    order_header,
    context,
  ));

  if (shipments.length == transactions.length) {
    for (let i=0; i!=shipments.length; ++i) {
      shipments[i].transaction = transactions[i];
    }
  }
  return shipments;
}

function get_transactions(order_detail_doc: HTMLDocument): ITransaction[] {
  const transaction_elems = extraction.findMultipleNodeValues(
    "//span[normalize-space(text())= 'Transactions']/../../div[contains(@class, 'expander')]/div[contains(@class, 'a-row')]/span/nobr/..",
    order_detail_doc.documentElement);
  const transactions = transaction_elems.map(e => transaction_from_elem(e as HTMLElement));
  return transactions;
}

function transaction_from_elem(elem: HTMLElement): ITransaction {
  function enthusiastically_strip(e: Node): string {
    return util.defaulted(e.textContent, '').replace(/\s\s+/g, ' ').trim();
  }
  const info_string = enthusiastically_strip(elem.childNodes[0]);
  const payment_amount = enthusiastically_strip(elem.childNodes[1]);
  return {
    payment_amount: payment_amount,
    info_string: info_string,
  };
}

function shipment_from_elem(
  shipment_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string
): IShipment {
  return {
    items: item.extractItems(shipment_elem, order_header, context),
    delivered: is_delivered(shipment_elem),
    status: get_status(shipment_elem),
    tracking_link: tracking_link(shipment_elem),
    transaction: null,
  };
}

function is_delivered(shipment_elem: HTMLElement): Delivered {
  const attr = shipment_elem.getAttribute('class');
	if ((attr as string).includes('shipment-is-delivered')) {
		return Delivered.YES;
  }
	return Delivered.UNKNOWN;
}

function get_status(shipment_elem: HTMLElement): string {
  try {
    const elem = extraction.findSingleNodeValue(
      "//div[contains(@class, 'shipment-info-container')]//div[@class='a-row']/span",
      shipment_elem,
      'shipment.status'
    );
    return util.defaulted((elem as HTMLElement)!.textContent!.trim(), '');
  } catch(err) {
    console.log('shipment.status got ', err);
    return 'UNKNOWN';
  }
}

function tracking_link(shipment_elem: HTMLElement): string {
  return util.defaulted_call(
    () => {
      const link_elem = extraction.findSingleNodeValue(
        "//a[contains(@href, '/progress-tracker/')]",
        shipment_elem,
        'shipment.tracking_link'
      );
      const base_url = util.defaulted((link_elem as HTMLElement).getAttribute('href'), '');
      const full_url = url.normalizeUrl(base_url, url.getSite());
      return full_url;
    },
    ''
  );
}

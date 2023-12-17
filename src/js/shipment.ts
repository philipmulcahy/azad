/* Copyright(c) 2023 Philip Mulcahy. */

import * as item from './item';
import * as extraction from './extraction';
import * as order_header from './order_header';
import * as req from './request';
import * as request_scheduler from './request_scheduler';
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
  tracking_id: string;
  transaction: ITransaction|null
}

export async function get_shipments(
  order_detail_doc: HTMLDocument,
  _url: string,  // for debugging
  order_header: order_header.IOrderHeader,
  context: string,
  scheduler: request_scheduler.IRequestScheduler,
  site: string,
): Promise<IShipment[]> {
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

  const shipment_promises = elems.map(e => shipment_from_elem(
    e as HTMLElement,
    order_header,
    context,
    scheduler,
    site,
  ));

  const shipments = await util.get_settled_and_discard_rejects(
    shipment_promises
  );

  if (shipments.length == transactions.length) {
    for (let i=0; i!=shipments.length; ++i) {
      shipments[i].transaction = transactions[i];
    }
  }
  return shipments;
}

function id_from_tracking_page(evt: req.Event): string {
  const html_text = evt.target.responseText;
  const doc = util.parseStringToDOM(html_text);
  const body = doc.body;
  const xpath = "//div[contains(@class, 'pt-delivery-card-trackingId')]";
  const id: string|null = extraction.getField(xpath, body, 'id_from_tracking_page');
  return id!=undefined ? id : '';
}

async function get_tracking_id(
  amazon_tracking_url: string,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<string> {
  const decorated_id = await req.makeAsyncRequest(
    amazon_tracking_url,
    id_from_tracking_page,
    scheduler, 
    '9999',
    false,  // nocache=false: cached response is acceptable
    'get_tracking_id',
  );
  const stripped_id = decorated_id.replace(/^.*: /, '');
  return stripped_id;
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

async function shipment_from_elem(
  shipment_elem: HTMLElement,
  order_header: order_header.IOrderHeader,
  context: string,
  scheduler: request_scheduler.IRequestScheduler,
  site: string,
): Promise<IShipment> {
  const tracking_link: string = get_tracking_link(shipment_elem, site);
  const tracking_id: string = await get_tracking_id(tracking_link, scheduler);
  return {
    items: item.extractItems(shipment_elem, order_header, context),
    delivered: is_delivered(shipment_elem),
    status: get_status(shipment_elem),
    tracking_link: tracking_link,
    tracking_id: tracking_id,
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

function get_tracking_link(shipment_elem: HTMLElement, site: string): string {
  return util.defaulted_call(
    () => {
      const link_elem = extraction.findSingleNodeValue(
        "//a[contains(@href, '/progress-tracker/')]",
        shipment_elem,
        'shipment.tracking_link'
      );
      const base_url = util.defaulted((link_elem as HTMLElement)
                           .getAttribute('href'), '');
      const full_url = url.normalizeUrl(base_url, site);
      return full_url;
    },
    ''
  );
}

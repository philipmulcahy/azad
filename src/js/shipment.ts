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
  shipment_id: string,
  items: item.IItem[],
  delivered: Delivered;
  status: string;
  tracking_link: string;
  tracking_id: string;
  transaction: ITransaction|null,
  refund: string;
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
  const transactions = get_transactions(doc_elem);

  function strategy_a(): Node[] {
    const candidates = extraction.findMultipleNodeValues(
        '//div[contains(@class, "a-box shipment")]',
        doc_elem);

    // We want elem to have 'shipment' as one of its classes
    // not just have one of its classes _contain_ 'shipment' in its name.
    // There may be a way to do this in xpath, but it wouldn't be very
    // readable, and I am also a bit short on sleep.
    return candidates.filter(
      elem => {
        const cs: string = util.defaulted(
          (elem as HTMLElement)!.getAttribute('class'), '');
          const classes: string[] = cs.split(' ');
          return classes.includes('shipment');
      }
    );
  }

  function strategy_b(): Node[] {
    return extraction.findMultipleNodeValues(
      '//div[div[@data-component="shipmentsLeftGrid"]/div[div[@data-component="shipmentStatus"]]]',
      doc_elem);
  }

  let elems = strategy_a();
  if (elems.length == 0) {
    elems = strategy_b();
  }

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

  const id: string|null = extraction.getField2(
    [xpath],
    body,
    '',
    'id_from_tracking_page'
  );

  return id;
}

async function get_tracking_id(
  amazon_tracking_url: string,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<string> {
  try {
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
  } catch (ex) {
    console.warn(
      'while trying to get tracking_id from', amazon_tracking_url, 'we got',
      ex
    );
    return '';
  }
}

function extract_shipment_id(tracking_link: string): string {
  // https://www.amazon.co.uk/progress-tracker/package/ref=ppx_od_dt_b_track_package?_encoding=UTF8&itemId=lkpgkspopoluuo&orderId=202-1416149-4038736&packageIndex=0&shipmentId=DT7cMbTTr&vt=ORDER_DETAILS
  return tracking_link.replace(/.*shipmentId=/, '')
                      .replace(/&.*/, '');
}

function enthusiastically_strip(e: Node): string {
  return util.defaulted(e.textContent, '').replace(/\s\s+/g, ' ').trim();
}

function get_transactions(order_detail_doc_elem: HTMLElement): ITransaction[] {
  function strategy_a(): ITransaction[] {
    function transaction_from_elem(elem: HTMLElement): ITransaction {
      const info_string = enthusiastically_strip(elem.childNodes[0]);
      const payment_amount = enthusiastically_strip(elem.childNodes[1]);
      return {
        payment_amount: payment_amount,
        info_string: info_string,
      };
    }
    const transaction_elems = extraction.findMultipleNodeValues(
      "//span[normalize-space(text())='Transactions']/../../div[contains(@class, 'expander')]/div[contains(@class, 'a-row')]/span/nobr/..",
      order_detail_doc_elem);
    const transactions = transaction_elems.map(e => transaction_from_elem(e as HTMLElement));
    return transactions;
  }
  function strategy_b(): ITransaction[] {
    function transaction_from_elem(elem: HTMLElement): ITransaction {

      // 'December 17, 2023 - Visa ending in 8489: $41.49'
      const text = enthusiastically_strip(elem.childNodes[3])
        .replace(/\n/g, ' ')
        .replace(/(  *)/g, ' ');

      const payment_amount = text.replace(/.*: ?/, '');
      const info_string = text.replace(/:.*/, '');
      return {
        payment_amount: payment_amount,
        info_string: info_string,
      };
    }
    const transaction_elems = extraction.findMultipleNodeValues(
      "//span[normalize-space(text())='Transactions']/../../div[contains(@class, 'expander')]/div[contains(@class, 'a-row')]/span/..",
      order_detail_doc_elem);
    const transactions = transaction_elems.map(e => transaction_from_elem(e as HTMLElement));
    return transactions;
  }
  const result = util.first_acceptable_non_throwing(
    [strategy_a, strategy_b],
    (result: ITransaction[])=>result.length > 0,
    []
  );
  return result ? result : [];  // tslint whingeing about nulls.
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
  const shipment_id = tracking_id != '' ?
                      extract_shipment_id(tracking_link) :
                      '';
  const refund: string = get_refund(shipment_elem);
  return {
    shipment_id: shipment_id,
    items: await item.extractItems(shipment_elem, order_header, scheduler, context),
    delivered: is_delivered(shipment_elem),
    status: get_status(shipment_elem),
    tracking_link: tracking_link,
    tracking_id: tracking_id,
    transaction: null,
    refund: refund,
  };
}

function get_refund(shipment_elem: HTMLElement): string {
  const refund = extraction.by_regex2(
    [
      ".//div[contains(@class, ' shipment')]//span[contains(text(), 'Refund for this return')]/../../../../..//span/text()"
    ],
    util.moneyRegEx(),
    '',
    shipment_elem,
    'shipment.refund'
  );
  return refund == null ? '' : refund;
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
      [
        ".//div[contains(@class, 'shipment-info-container')]//div[@class='a-row']/span",
        ".//div[@data-component='shipmentStatus']",
      ].join('|'),
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
        [
          ".//a[contains(@href, '/progress-tracker/')]",
          ".//a[contains(@href, '/ship-track')]",
        ].join('|'),
        shipment_elem,
        'shipment.tracking_link'
      );
      const base_url = util.defaulted(
        (link_elem as HTMLElement).getAttribute('href'),
        ''
      );
      const full_url = url.normalizeUrl(base_url, site);
      return full_url;
    },
    ''
  );
}

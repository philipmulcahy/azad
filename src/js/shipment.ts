/* Copyright(c) 2023 Philip Mulcahy. */

import * as item from './item';
import * as extraction from './extraction';
import * as util from './util';


const EXAMPLE_FULL_ITEM_LINK_PATH = "//div[contains(@class, 'a-box shipment')]//a[@class='a-link-normal' and contains(@href, '/gp/product/') and normalize-space(text())]";

const FULL_SHIPMENT_PATH = "//div[contains(@class, 'shipment')]";

const ITEM_LINK_FROM_SHIPMENT = "//a[@class='a-link-normal' and contains(@href, '/gp/product/') and normalize-space(text())]";
const PRICE_SPAN_FROM_ITEM_LINK = "/../../div[@class='a-row']/span[contains(@class,'a-color-price')]/nobr/text()";

export interface IShipment {
  // items: item.IItem[],
  delivered: boolean,
  status: string,
  tracking_link: string,
};

export function getShipments(order_detail_doc: HTMLDocument): IShipment[] {
  if (order_detail_doc.URL.includes('205-9714306-6543524')) {
    console.log('shipment.getShipments processing 205-9714306-6543524')
  }
  const doc_elem = order_detail_doc.documentElement;

  const candidates = util.findMultipleNodeValues(
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

  const shipments = elems.map(e => shipmentFromElem(e as HTMLElement));
  return shipments;
}

function shipmentFromElem(shipment_elem: HTMLElement): IShipment {
  return {
    delivered: is_delivered(shipment_elem),
    status: status(shipment_elem),
    tracking_link: tracking_link(shipment_elem),
  };
}

function is_delivered(shipment_elem: HTMLElement): boolean {
  const attr = shipment_elem.getAttribute('class');
  return util.defaulted(
    (attr as string).includes('shipment-is-delivered'), false);
}

function status(shipment_elem: HTMLElement): string {
  try {
    const elem = util.findSingleNodeValue(
      "/div/div[contains(@class, 'shipment-info-container')]//div[@class='a-row']/span",
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
      const link_elem = util.findSingleNodeValue(
        "//a[contains(@href, '/progress-tracker/')]",
        shipment_elem,
        'shipment.tracking_link'
      );
      return util.defaulted((link_elem as HTMLElement).getAttribute('href'), '');
    },
    ''
  );
}

// function items(shipment_elem: HTMLElement): item.IItem[] {
// }

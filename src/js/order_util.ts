/* Copyright(c) 2017-2021 Philip Mulcahy. */

'use strict';

import * as item from './item';
import * as order from './order';
import * as shipment from './shipment';
import * as util from './util';

export interface IEnrichedShipment extends shipment.IShipment {
  order: order.ISyncOrder
}

export interface IEnrichedItem extends item.IItem {
  shipment: shipment.IShipment;
}

export async function enriched_shipments_from_orders(
  orders: order.IOrder[]
): Promise<IEnrichedShipment[]> {
  const oop = orders.map(o => o.sync());
  const oo = await util.get_settled_and_discard_rejects(oop);
  const shipments: IEnrichedShipment[] = oo.flatMap( o => {
    const ss = o.shipments;
    if (ss.length == 0) {
      ss.push({
        shipment_id: '',
        items: o.item_list,
        delivered: shipment.Delivered.UNKNOWN,
        status: 'no shipment',
        tracking_link: '',
        tracking_id: '',
        transaction: null,
        refund: '',
      });
    }
    return ss.map( s => ({
      shipment_id: s.shipment_id,
      order: o,
      items: s.items,
      delivered: s.delivered,
      status: s.status,
      tracking_link: s.tracking_link,
      tracking_id: s.tracking_id,
      transaction: s.transaction,
      refund: s.refund,
    }));
    return shipments;
  });
  return shipments;
}

export async function enriched_items_from_orders(
  orders: order.IOrder[],
): Promise<IEnrichedItem[]> {
  const shipments = await enriched_shipments_from_orders(orders);
  const items: IEnrichedItem[] = shipments.flatMap( s => {
    const ii = s.items;
    return ii.map( i => ({
      shipment: s,
      description: i.description,
      price: i.price,
      quantity: i.quantity,
      url: i.url,
      asin: i.asin,
      order_header: i.order_header,
    }));
  });
  return items;
}

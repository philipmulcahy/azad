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

export async function enriched_items_from_orders(
  orders: order.IOrder[],
): Promise<IEnrichedItem[]> {
  const oop = orders.map(o => o.sync());
  const oo = await util.get_settled_and_discard_rejects(oop);
  const shipments: IEnrichedShipment[] = oo.flatMap( o => {
    const ss = o.shipments;
    if (ss.length == 0) {
      ss.push({
        items: o.item_list,
        delivered: shipment.Delivered.UNKNOWN,
        status: 'no shipment',
        tracking_link: '',
        transaction: null,
      });
    }
    return ss.map( s => ({
      order: o,
      items: s.items,
      delivered: s.delivered,
      status: s.status,
      tracking_link: s.tracking_link,
      transaction: s.transaction,
    }));
    return shipments;
  });
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

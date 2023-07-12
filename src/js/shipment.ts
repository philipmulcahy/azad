/* Copyright(c) 2023- Philip Mulcahy. */

import * as azad_entity from './entity';
import * as azad_item from './item';
// import * as azad_order from './order';
import * as util from './util';

export interface IShipment extends azad_entity.IEntity {
    status: string;
    shipping_date?: string;
    delivery_date?: string;
    tracking_link?: string;
    items: azad_item.IItem[];
};

export function parse_detail_page(detail_doc: HTMLDocument): IShipment[] {
  const elem = detail_doc.documentElement;
  const shipment_pattern = "//div[contains(@class, ' shipment ')]//a[@class='a-link-normal' and contains(@href, '/gp/product/') and normalize-space(text())]/../../..";
  const shipment_elems: Node[] = util.findMultipleNodeValues(
    shipment_pattern, elem);
  const shipments = shipment_elems.map(parse_shipment_element);
  return shipments;
} 

function parse_shipment_element(shipment_elem: HTMLElement): IShipment {
  //                                            item link                            price
  const item_pattern = "//div[./*/*/a[contains(@href, '/gp/')] and ./*/*/span[contains(@class, 'a-color-price')]]";
  const item_elems: Node[] = util.findMultipleNodeValues(item_pattern, shipment_elem);
  const items = item_elems.map(parse_item); 
  
  const shipment: IShipment = {
    status: 'TODO',
    shipping_date: null,
    delivery_date: null,
    tracking_link: null,
    items: items,
  };
  return shipment;
}

function parse_item(elem: Element): azad_item.IItem {
  
    description: string;
    order_date: Date|null;
    order_detail_url: string;
    order_id: string;
    price: string;
    quantity: number;
    url: string;
    asin: string;
}

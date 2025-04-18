/* Copyright(c) 2017-2021 Philip Mulcahy. */

'use strict';

import * as azad_entity from './entity';
import * as date from './date';
import * as item from './item';
import * as notice from './notice';
import * as order_details from './order_details';
import * as order_header from './order_header';
import * as olp from './order_list_page';
import * as order_impl from './order_impl';
import * as signin from './signin';
import * as shipment from './shipment';
import * as request_scheduler from './request_scheduler';
import * as single_fetch from './single_fetch';
import * as urls from './url';
import * as util from './util';

export interface IOrder extends azad_entity.IEntity {
  id(): Promise<string>;
  detail_url(): Promise<string>;
  invoice_url(): Promise<string>;
  list_url(): Promise<string>;
  payments_url(): Promise<string>;

  date(): Promise<Date|null>;
  gift(): Promise<string>;
  gst(): Promise<string>;
  item_list(): Promise<item.IItem[]>;
  shipments(): Promise<shipment.IShipment[]>;
  payments(): Promise<string[]>;
  postage(): Promise<string>;
  postage_refund(): Promise<string>;
  pst(): Promise<string>;
  refund(): Promise<string>;
  site(): Promise<string>;
  total(): Promise<string>;
  us_tax(): Promise<string>;
  subscribe_and_save(): Promise<string>;
  vat(): Promise<string>;
  who(): Promise<string>;

  sync(): Promise<ISyncOrder>;
}

export interface ISyncOrder extends azad_entity.IEntity {
  id: string;
  detail_url: string;
  invoice_url: string;
  list_url: string;
  payments_url: string;
  date: Date|null;
  gift: string;
  gst: string;
  item_list: item.IItem[];
  shipments: shipment.IShipment[];
  payments: string[];
  postage: string;
  postage_refund: string;
  pst: string;
  refund: string;
  site: string;
  total: string;
  us_tax: string;
  subscribe_and_save: string;
  vat: string;
  who: string;
}

class SyncOrder implements ISyncOrder {
  id: string = '';
  detail_url: string = '';
  invoice_url: string = '';
  list_url: string = '';
  payments_url: string = '';
  date: Date|null = null;
  gift: string = '';
  gst: string = '';
  shipments: shipment.IShipment[] = [];
  item_list: item.IItem[] = [];
  payments: string[] = [];
  postage: string = '';
  postage_refund: string = '';
  pst: string = '';
  refund: string = '';
  site: string = '';
  total: string = '';
  us_tax: string = '';
  subscribe_and_save: string = '';
  vat: string = '';
  who: string = '';

  constructor(rhs: ISyncOrder) {
    Object.assign(this, rhs);
  }

  unsync(): IOrder {
    return {
      sync: ()=>Promise.resolve(this),
      id: ()=>Promise.resolve(this.id),
      detail_url: ()=>Promise.resolve(this.detail_url),
      invoice_url: ()=>Promise.resolve(this.invoice_url),
      list_url: ()=>Promise.resolve(this.list_url),
      payments_url: ()=>Promise.resolve(this.payments_url),
      date: ()=>Promise.resolve(this.date),
      gift: ()=>Promise.resolve(this.gift),
      gst: ()=>Promise.resolve(this.gst),
      shipments: ()=>Promise.resolve(this.shipments),
      item_list: ()=>Promise.resolve(this.item_list),
      payments: ()=>Promise.resolve(this.payments),
      postage: ()=>Promise.resolve(this.postage),
      postage_refund: ()=>Promise.resolve(this.postage_refund),
      pst: ()=>Promise.resolve(this.pst),
      refund: ()=>Promise.resolve(this.refund),
      site: ()=>Promise.resolve(this.site),
      total: ()=>Promise.resolve(this.total),
      us_tax: ()=>Promise.resolve(this.us_tax),
      subscribe_and_save: ()=>Promise.resolve(this.subscribe_and_save),
      vat: ()=>Promise.resolve(this.vat),
      who: ()=>Promise.resolve(this.who),
    };
  }
}

class Order implements IOrder{
  impl: order_impl.OrderImpl;

  constructor(impl: order_impl.OrderImpl) {
    this.impl = impl;
  }

  async sync(): Promise<ISyncOrder> {
    const id = await this.id();
    const detail_url = await this.detail_url();
    const invoice_url = await this.invoice_url();
    const list_url = await this.list_url();
    const payments_url = await this.payments_url();
    const date = await this.date();
    const gift = await this.gift();
    const gst = await this.gst();
    const shipments = await this.shipments();
    const item_list = await this.item_list();
    const payments = await this.payments();
    const postage = await this.postage();
    const postage_refund = await this.postage_refund();
    const pst = await this.pst();
    const refund = await this.refund();
    const site = await this.site();
    const total = await this.total();
    const us_tax = await this.us_tax();
    const subscribe_and_save = await this.subscribe_and_save();
    const vat = await this.vat();
    const who = await this.who();

    return {
      id: id,
      detail_url: detail_url,
      invoice_url: invoice_url,
      list_url: list_url,
      payments_url: payments_url,
      date: date,
      gift: gift,
      gst: gst,
      shipments: shipments,
      item_list: item_list,
      payments: payments,
      postage: postage,
      postage_refund: postage_refund,
      pst: pst,
      refund: refund,
      site: site,
      total: total,
      us_tax: us_tax,
      subscribe_and_save: subscribe_and_save,
      vat: vat,
      who: who,
    };
  }

  id(): Promise<string> {
    return Promise.resolve(util.defaulted(this.impl.header.id, ''));
  }
  list_url(): Promise<string> {
    return Promise.resolve(util.defaulted(this.impl.header.list_url, ''));
  }
  detail_url(): Promise<string> {
    return Promise.resolve(util.defaulted(this.impl.header.detail_url, ''));
  }
  payments_url(): Promise<string> {
    return Promise.resolve(util.defaulted(this.impl.header.payments_url, ''));
  }
  site(): Promise<string> {
    return Promise.resolve(util.defaulted(this.impl.header.site, ''));
  }
  date(): Promise<Date|null> {
    return Promise.resolve(this.impl.header.date);
  }
  total(): Promise<string> {
    return this._detail_dependent_promise(detail => detail.total);
  }
  async who(): Promise<string> {
    const details = await this.impl.detail_promise;
    const who1: string = details?.details.who ?? '';
    const who2: string = this.impl.header.who ?? '';
    const who = util.defaulted(who1, who2);
    return Promise.resolve(who);
  }
  async shipments(): Promise<shipment.IShipment[]> {
    if (this.impl.detail_promise) {
      try {
        const details = await this.impl.detail_promise;
        const shipments = details.shipments;
        return shipments;
      } catch (ex) {
        console.warn('detail_promise rejected', ex);
      }
    }
    return Promise.resolve([]);
  }
  async item_list(): Promise<item.IItem[]> {
    if (this.impl.detail_promise) {
      try {
        const details = await this.impl.detail_promise;
        const items: item.IItem[] = details.items;
        return items;
      } catch (ex) {
        console.warn('detail_promise rejected', ex);
      }
    }
    return Promise.resolve([]);
  }
  async payments(): Promise<string[]> {
    const default_payments: string[] = [];
    const payments_promise = util.defaulted(
      this.impl.payments_promise, Promise.resolve(default_payments));
    try {
      const payments = await payments_promise;
      return payments;
    } catch (ex) {
      console.warn('While getting payments we caught: ', ex);
      return Promise.resolve(default_payments);
    }
  }
  async _detail_dependent_promise(
      detail_lambda: (d: order_details.IOrderDetails) => string
  ): Promise<string> {
    if (this.impl.detail_promise) {
      try {
        const details_and_items = await this.impl.detail_promise;
        const details: order_details.IOrderDetails = details_and_items.details;
        const details_string = detail_lambda(details);
        return details_string;
      } catch (ex) {
        console.warn('detail_promise rejected', ex);
      }
    }
    return Promise.resolve('');
  }
  postage(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.postage );
  }
  postage_refund(): Promise<string> {
    return this._detail_dependent_promise(
      detail => detail.postage_refund
    );
  }
  gift(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.gift );
  }
  us_tax(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.us_tax );
  }
  subscribe_and_save(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.subscribe_and_save );
  }
  vat(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.vat );
  }
  gst(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.gst );
  }
  pst(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.pst );
  }
  refund(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.refund );
  }
  invoice_url(): Promise<string> {
    return this._detail_dependent_promise( detail => detail.invoice_url );
  }
}

async function fetchYear(
  year: number,
  scheduler: request_scheduler.IRequestScheduler,
  date_filter: date.DateFilter,
): Promise<IOrder[]> {
  const headers: order_header.IOrderHeader[] = await olp.get_headers(
    urls.getSite(),
    year,
    scheduler,
  );
  return headers.map(h => create(h, scheduler, date_filter))
                .filter(o => o) as IOrder[];
}

export async function getOrdersByYear(
  years: number[],
  scheduler: request_scheduler.IRequestScheduler,
  latest_year: number,
  date_filter: date.DateFilter,
): Promise<IOrder[]> {
  try {
    const orderss = await Promise.all(
      years.map(
        function(year: number): Promise<IOrder[]> {
          const nocache_top_level = (year == latest_year);
          return fetchYear(year, scheduler, date_filter);
        }
      )
    );
    return orderss.flat();
  } catch (ex) {
    console.error('getOrdersByYear blew up', ex);
    return [];
  }
}

export async function getOrdersByRange(
  start_date: Date,
  end_date: Date,
  scheduler: request_scheduler.IRequestScheduler,
  latest_year: number,
  date_filter: date.DateFilter,
): Promise<IOrder[]> {
  console.assert(start_date < end_date);
  const start_year = start_date.getFullYear();
  const end_year = end_date.getFullYear();

  const years: number[] = [];
  for (let y=start_year; y<=end_year; y++) {
    years.push(y);
  }

  const order_years = years.map(
    year => {
      const nocache_top_level = latest_year == year;
      return fetchYear(year, scheduler, date_filter);
    }
  );

  const orderss = await async function() {
    try {
      const orderss = await util.get_settled_and_discard_rejects(order_years);
      return orderss;
    } catch (ex) {
      console.error('failed to get order_years');
      return [[]];
    }
  }();

  const orders: IOrder[] = orderss.flat();

  const f_in_date_window = async function(order: IOrder): Promise<boolean> {
    const order_date = await order.date();

    if (order_date) {
      return start_date <= order_date && order_date <= end_date;
    } else {
      return false;
    }
  };

  const filtered_orders = await util.filter_by_async_predicate(
    orders,
    f_in_date_window,
  );

  return filtered_orders;
}

export async function get_legacy_items(order: IOrder)
  : Promise<Record<string, string>>
{
  const result: Record<string, string> = {};
  const item_list: item.IItem[] = await order.item_list();
  item_list.forEach(item => {
    result[item.description] = item.url;
  });
  return result;
}

export async function assembleDiagnostics(
  order: IOrder,
  getScheduler: () => request_scheduler.IRequestScheduler,
)
  : Promise<Record<string, any>>
{
  const sync_order = await order.sync();
  const diagnostics: Record<string, any> = {};
  const field_names: (keyof ISyncOrder)[] = [
    'id',
    'list_url',
    'detail_url',
    'payments_url',
    'date',
    'total',
    'who',
  ];
  field_names.forEach(
    (field_name: keyof ISyncOrder) => {
      const value: any = sync_order[field_name];
      diagnostics[<string>(field_name)] = value;
    }
  );

  diagnostics['items'] = await get_legacy_items(order);

  async function get_url_html_map(
    urls: string[]
  ): Promise<Record<string, string>>
  {
    const data: Record<string, string> = {};
    const done_promises = urls.filter(url => url != '' && url != null)
                              .map( async url => {
      const response = await single_fetch.checkedStaticFetch(url);
      const html = await response.text();
      data[url] = html;
      return;
    });
    await Promise.allSettled(done_promises);
    return data;
  }

  async function get_item_data(
    order: ISyncOrder
  ): Promise<Record<string, string>> {
    const urls = order.item_list
                      .map(item => item.url);
    const data = await get_url_html_map(urls);
    return data;
  }

  diagnostics['item_data'] = await get_item_data(sync_order);

  async function get_tracking_data(
    order: ISyncOrder,
  ): Promise<Record<string, string>> {
    const urls = order.shipments
                      .map(s => s.tracking_link);
    const data = await get_url_html_map(urls);
    return data;
  }

  diagnostics['tracking_data'] = await get_tracking_data(sync_order);

  return Promise.all([
    single_fetch.checkedDynamicFetch(
      util.defaulted(sync_order.list_url, ''),  // url
      'orderListHtmlForDebug',

      // ready_xpath: TODO - derive from mainline scraping code, DRY!
      '//div[@id="orderCard"]//div[@id="orderCardHeader"]|//div[contains(@class, "order-card")]',

      getScheduler,
    ).then(
      (text: string) => {
        diagnostics['list_html'] = text; 
      },
      (err: any) => {
        console.warn(`list_html fetch for order diagnostics failed: ${err}`);
        diagnostics['list_html'] = JSON.stringify(err);
      }
    ),

    single_fetch.checkedStaticFetch( util.defaulted(sync_order.detail_url, '') )
      .then( (response: Response) => response.text() )
      .then( (text: string) => { diagnostics['detail_html'] = text; } ),

    single_fetch.checkedStaticFetch( util.defaulted(sync_order.payments_url, '') )
      .then( (response: Response) => response.text() )
      .then( (text: string) => { diagnostics['invoice_html'] = text; } ),
  ]).then(
    () => {
      getScheduler().abort();
      return diagnostics;
    },
    error_msg => {
      getScheduler().abort();
      notice.showNotificationBar(error_msg, document);
      return diagnostics;
    }
  );
}

export function create(
  header: order_header.IOrderHeader,
  scheduler: request_scheduler.IRequestScheduler,
  date_filter: date.DateFilter,
): IOrder|null {
  try {
    const impl = new order_impl.OrderImpl(
      header,
      scheduler,
      date_filter,
    );
    const wrapper = new Order(impl);
    return wrapper;
  } catch(err) {
    const msg = 'order.create caught: ' + err + '; returning null';
    console.warn(msg);
    return null;
  }
}

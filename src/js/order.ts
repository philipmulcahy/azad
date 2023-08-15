/* Copyright(c) 2017-2021 Philip Mulcahy. */

'use strict';

import * as date from './date';
import * as azad_entity from './entity';
import * as notice from './notice';
import * as extraction from './extraction';
import * as order_details from './order_details';
import * as order_header from './order_header';
import * as signin from './signin';
import * as sprintf from 'sprintf-js';
import * as dom2json from './dom2json';
import * as request_scheduler from './request_scheduler';
import * as urls from './url';
import * as util from './util';
import * as item from './item';

function getCachedAttributeNames() {
    return new Set<string>(['class', 'href', 'id', 'style']);
}

function getCacheExcludedElementTypes() {
    return new Set<string>(['img']);
}

interface IOrderDetailsAndItems {
    details: order_details.IOrderDetails;
    items: item.IItem[];
};

function extractDetailPromise(
    header: order_header.IOrderHeader,
    scheduler: request_scheduler.IRequestScheduler
): Promise<IOrderDetailsAndItems> {
  return new Promise<IOrderDetailsAndItems>(
    (resolve, reject) => {
        const context = 'id:' + header.id;
        const url = header.detail_url;
        if(!url) {
            const msg = 'null order detail query: cannot schedule';
            console.error(msg);
            reject(msg);
        } else {
            const event_converter = function(
                evt: { target: { responseText: string; }; }
            ): IOrderDetailsAndItems {
                const doc = util.parseStringToDOM( evt.target.responseText );
                return {
                    details: order_details.extractDetailFromDoc(header, doc),
                    items: item.extractItems(
                        util.defaulted(header.id, ''),
                        header.date,
                        util.defaulted(header.detail_url, ''),
                        doc.documentElement,
                        context,
                    ),
                };
            };
            try {
                scheduler.scheduleToPromise<IOrderDetailsAndItems>(
                    url,
                    event_converter,
                    util.defaulted(header.id, '9999'),
                    false
                ).then(
                    (response: request_scheduler.IResponse<IOrderDetailsAndItems>) => {
                      resolve(response.result)
                    },
                    url => {
                      const msg = 'scheduler rejected ' + header.id + ' ' + url;
                      console.error(msg);
                      reject('timeout or other problem when fetching ' + url)
                    },
                );
            } catch (ex) {
                const msg = 'scheduler upfront rejected ' + header.id + ' ' + url;
                console.error(msg);
                reject(msg);
            }
        }
    }
  );
}

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
    payments(): Promise<string[]>;
    postage(): Promise<string>;
    postage_refund(): Promise<string>;
    pst(): Promise<string>;
    refund(): Promise<string>;
    site(): Promise<string>;
    total(): Promise<string>;
    us_tax(): Promise<string>;
    vat(): Promise<string>;
    who(): Promise<string>;
};

interface ISyncOrder extends azad_entity.IEntity {
    id: string;
    detail_url: string;
    invoice_url: string;
    list_url: string;
    payments_url: string;
    date: Date|null;
    gift: string;
    gst: string;
    item_list: item.IItem[];
    payments: string[];
    postage: string;
    postage_refund: string;
    pst: string;
    refund: string;
    site: string;
    total: string;
    us_tax: string;
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
    item_list: item.IItem[] = [];
    payments: string[] = [];
    postage: string = '';
    postage_refund: string = '';
    pst: string = '';
    refund: string = '';
    site: string = '';
    total: string = '';
    us_tax: string = '';
    vat: string = '';
    who: string = '';

    constructor(rhs: ISyncOrder) {
        Object.assign(this, rhs);
    }

    unsync(): IOrder {
      return {
        id: ()=>Promise.resolve(this.id),
        detail_url: ()=>Promise.resolve(this.detail_url),
        invoice_url: ()=>Promise.resolve(this.invoice_url),
        list_url: ()=>Promise.resolve(this.list_url),
        payments_url: ()=>Promise.resolve(this.payments_url),
        date: ()=>Promise.resolve(this.date),
        gift: ()=>Promise.resolve(this.gift),
        gst: ()=>Promise.resolve(this.gst),
        item_list: ()=>Promise.resolve(this.item_list),
        payments: ()=>Promise.resolve(this.payments),
        postage: ()=>Promise.resolve(this.postage),
        postage_refund: ()=>Promise.resolve(this.postage_refund),
        pst: ()=>Promise.resolve(this.pst),
        refund: ()=>Promise.resolve(this.refund),
        site: ()=>Promise.resolve(this.site),
        total: ()=>Promise.resolve(this.total),
        us_tax: ()=>Promise.resolve(this.us_tax),
        vat: ()=>Promise.resolve(this.vat),
        who: ()=>Promise.resolve(this.who),
      }
    }
}

class Order implements IOrder{
    impl: OrderImpl;

    constructor(impl: OrderImpl) {
        this.impl = impl
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
        const item_list = await this.item_list();
        const payments = await this.payments();
        const postage = await this.postage();
        const postage_refund = await this.postage_refund();
        const pst = await this.pst();
        const refund = await this.refund();
        const site = await this.site();
        const total = await this.total();
        const us_tax = await this.us_tax();
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
            item_list: item_list,
            payments: payments,
            postage: postage,
            postage_refund: postage_refund,
            pst: pst,
            refund: refund,
            site: site,
            total: total,
            us_tax: us_tax,
            vat: vat,
            who: who,
        }
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
    who(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.header.who, ''));
    }
    item_list(): Promise<item.IItem[]> {
        const items: item.IItem[] = [];
        if (this.impl.detail_promise) {
            return this.impl.detail_promise.then( details => {
                details.items.forEach(item => {
                    items.push(item);
                });
                return items;
            });
        } else {
            return Promise.resolve(items);
        }
    }
    payments(): Promise<string[]> {
        return util.defaulted(
            this.impl.payments_promise,
            Promise.resolve([])
        );
    }

    _detail_dependent_promise(
        detail_lambda: (d: order_details.IOrderDetails) => string
    ): Promise<string> {
        if (this.impl.detail_promise) {
            return this.impl.detail_promise.then(
                details => detail_lambda(details.details)
            );
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
    };
    us_tax(): Promise<string> {
        return this._detail_dependent_promise( detail => detail.us_tax )
    }
    vat(): Promise<string> {
        return this._detail_dependent_promise( detail => detail.vat )
    }
    gst(): Promise<string> {
        return this._detail_dependent_promise( detail => detail.gst )
    }
    pst(): Promise<string> {
        return this._detail_dependent_promise( detail => detail.pst )
    }
    refund(): Promise<string> {
        return this._detail_dependent_promise( detail => detail.refund )
    }
    invoice_url(): Promise<string> {
        return this._detail_dependent_promise( detail => detail.invoice_url )
    }
}

type DateFilter = (d: Date|null) => boolean;

class OrderImpl {
    header: order_header.IOrderHeader;
    detail_promise: Promise<IOrderDetailsAndItems>|null;
    payments_promise: Promise<string[]>|null;

    constructor(
        header: order_header.IOrderHeader,
        scheduler: request_scheduler.IRequestScheduler,
        date_filter: DateFilter,
    ) {
        this.header = header;
        this.detail_promise = null;
        this.payments_promise = null;
        this._extractOrder(date_filter, scheduler);
    }

    _extractOrder(
      date_filter: DateFilter,
      scheduler: request_scheduler.IRequestScheduler
    ) {
        const context = 'id:' + this.header.id;
        if (!date_filter(this.header.date)) {
          throw_order_discarded_error(this.header.id);
        }

        this.detail_promise = extractDetailPromise(this.header, scheduler);
        this.payments_promise = new Promise<string[]>(
            (
                (
                    resolve: (payments: string[]) => void,
                    reject: (msg: string) => void
                ) => {
                    if (this.header.id?.startsWith('D')) {
                        const date = this.header.date ?
                            util.dateToDateIsoString(this.header.date) :
                            '';
                        resolve([
                            this.header.total ?
                                date + ': ' + this.header.total :
                                date
                        ]);
                    } else {
                        const event_converter = function(evt: any) {
                            const doc = util.parseStringToDOM( evt.target.responseText );
                            const payments = extraction.payments_from_invoice(doc);
                            // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
                            return payments;
                        }.bind(this);
                        if (this.header.payments_url) {
                            scheduler.scheduleToPromise<string[]>(
                                this.header.payments_url,
                                event_converter,
                                util.defaulted(this.header.id, '9999'), // priority
                                false  // nocache
                            ).then(
                                (response: {result: string[]}) => {
                                  resolve(response.result)
                                },
                                (url: string) => {
                                  const msg = 'timeout or other error while fetching ' + url + ' for ' + this.header.id;
                                  console.error(msg);
                                  reject(msg);
                                },
                            );
                        } else {
                            reject('cannot fetch payments without payments_url');
                        }
                    }
                }
            ).bind(this)
        );
    }

}

interface IOrdersPageData {
    expected_order_count: number;
    order_headers: order_header.IOrderHeader[];
};

async function getOrdersForYearAndQueryTemplate(
    year: number,
    query_template: string,
    scheduler: request_scheduler.IRequestScheduler,
    nocache_top_level: boolean,
    date_filter: DateFilter,
): Promise<Promise<IOrder>[]>
{
    const generateQueryString = function(startOrderPos: number) {
        return sprintf.sprintf(
            query_template,
            {
                site: urls.getSite(),
                year: year,
                startOrderPos: startOrderPos
            }
        );
    };

    const convertOrdersPage = function(evt: any): IOrdersPageData {
      const d = util.parseStringToDOM(evt.target.responseText);
      const context = 'Converting orders page';
      const countSpan = util.findSingleNodeValue(
          './/span[@class="num-orders"]', d.documentElement, context);
      if ( !countSpan ) {
          const msg = 'Error: cannot find order count elem in: ' + evt.target.responseText
          console.error(msg);
          throw(msg);
      }
      const textContent = countSpan.textContent;
      const splits = textContent!.split(' ');
      if (splits.length == 0) {
          const msg = 'Error: not enough parts';
          console.error(msg);
          throw(msg);
      }
      const expected_order_count: number = parseInt( splits[0], 10 );
      console.log(
          'Found ' + expected_order_count + ' orders for ' + year
      );
      if(isNaN(expected_order_count)) {
          console.warn(
              'Error: cannot find order count in ' + countSpan.textContent
          );
      }
      let ordersElem;
      try {
          ordersElem = d.getElementById('ordersContainer');
      } catch(err) {
          const msg = 'Error: maybe you\'re not logged into ' +
                      'https://' + urls.getSite() + '/gp/css/order-history ' +
                      err;
          console.warn(msg)
          throw msg;
      }
      const order_elems: HTMLElement[] = util.findMultipleNodeValues(
        './/*[contains(concat(" ", normalize-space(@class), " "), " order ")]',
        ordersElem
      ).map( node => <HTMLElement>node );
      const serialized_order_elems = order_elems.map(
          elem => dom2json.toJSON(elem, getCachedAttributeNames())
      );
      if ( !serialized_order_elems.length ) {
          console.error(
              'no order elements in converted order list page: ' +
              evt.target.responseURL
          );
      }
      const converted = {
        expected_order_count: expected_order_count,
        order_elems: order_elems.map( elem => dom2json.toJSON(elem) ),
        order_headers: order_elems.map(
          elem => order_header.extractOrderHeader(elem, evt.target.responseURL)
        ),
      }
      return converted;
    };

    const expected_order_count = await async function() {
      const orders_page_data = await scheduler.scheduleToPromise<IOrdersPageData>(
          generateQueryString(0),
          convertOrdersPage,
          '00000',
          nocache_top_level
      );
      return orders_page_data.result.expected_order_count;
    }();

    const orderHeaderDataToOrders = function(
        response: request_scheduler.IResponse<IOrdersPageData>,
        date_filter: DateFilter,
    ): Promise<IOrder>[] {
      const orders_page_data = response.result;
      function makeOrderPromise(header: order_header.IOrderHeader)
        : Promise<IOrder>|null
      {
          const order = create(header, scheduler, date_filter);
          if (typeof(order) === 'undefined') {
            return null;
          } else {
            return Promise.resolve(order!);
          }
      }
      const order_promises = orders_page_data.order_headers.map(makeOrderPromise).filter(o => o);
      return order_promises as Promise<IOrder>[];
    };

    const getOrderPromises = function(
      expected_order_count: number,
    ): Promise<Promise<IOrder>[]> {
        const page_done_promises: Promise<null>[] = [];
        const order_promises: Promise<IOrder>[] = [];
        for(let iorder = 0; iorder < expected_order_count; iorder += 10) {
            console.log(
                'sending request for order: ' + iorder + ' onwards'
            );
            page_done_promises.push(
                scheduler.scheduleToPromise<IOrdersPageData>(
                    generateQueryString(iorder),
                    convertOrdersPage,
                    '2',
                    false
                ).then(
                    page_data => {
                        const promises = orderHeaderDataToOrders(
                          page_data, date_filter);
                        order_promises.push(...promises);
                    },
                    msg => {
                        console.error(msg);
                        return null;
                    }
                ).then(
                    () => null,
                    msg => {
                        console.error(msg);
                        return null;
                    }
                )
            );
        }
        console.log('finished sending order list page requests');
        return Promise.all(page_done_promises).then(
            () => {
                console.log('returning all order promises');
                return order_promises;
            }
        );
    }

    return getOrderPromises(expected_order_count);
}

const TEMPLATES_BY_SITE: Record<string, string[]> = {
    'www.amazon.co.jp': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s'],
    'www.amazon.co.uk': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s'],
   'www.amazon.com.au': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s'],
    'www.amazon.de': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_GB'],
    'www.amazon.es': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_GB'],
    'www.amazon.in': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_GB'],
    'www.amazon.it': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_GB'],
    'www.amazon.ca': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s'],
    'www.amazon.fr': ['https://%(site)s/gp/css/order-history' +
        '?opt=ab&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&returnTo=' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s'],
    'www.amazon.com': [
        'https://%(site)s/gp/css/order-history' +
        '?opt=ab' +
        '&ie=UTF8' +
        '&digitalOrders=1' +
        '&unifiedOrders=0' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_US',

        'https://%(site)s/gp/css/order-history' +
        '?opt=ab' +
        '&ie=UTF8' +
        '&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_US'],
    'www.amazon.com.mx': [
        'https://%(site)s/gp/your-account/order-history/ref=oh_aui_menu_date' +
        '?ie=UTF8' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s',

        'https://%(site)s/gp/your-account/order-history/ref=oh_aui_menu_yo_new_digital' +
        '?ie=UTF8' +
        '&digitalOrders=1' +
        '&orderFilter=year-%(year)s' +
        '&unifiedOrders=0' +
        '&startIndex=%(startOrderPos)s'],
    'other': [
        'https://%(site)s/gp/css/order-history' +
        '?opt=ab' +
        '&ie=UTF8' +
        '&digitalOrders=1' +
        '&unifiedOrders=0' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_GB',

        'https://%(site)s/gp/css/order-history' +
        '?opt=ab' +
        '&ie=UTF8' +
        '&digitalOrders=1' +
        '&unifiedOrders=1' +
        '&orderFilter=year-%(year)s' +
        '&startIndex=%(startOrderPos)s' +
        '&language=en_GB'],
}

function fetchYear(
    year: number,
    scheduler: request_scheduler.IRequestScheduler,
    nocache_top_level: boolean,
    date_filter: DateFilter,
): Promise<Promise<IOrder>[]> {
    let templates = TEMPLATES_BY_SITE[urls.getSite()];
    if ( !templates ) {
        templates = TEMPLATES_BY_SITE['other'];
        notice.showNotificationBar(
            'Your site is not fully supported.\n' +
            'For better support, click on the popup where it says\n' +
            '"CLICK HERE if you get incorrect results!",\n' +
            'provide diagnostic information, and help me help you.',
            document
        );
    }

    const promises_to_promises: Promise<Promise<IOrder>[]>[] = templates.map(
        template => template + '&disableCsd=no-js'
    ).map(
        template => getOrdersForYearAndQueryTemplate(
            year,
            template,
            scheduler,
            nocache_top_level,
            date_filter,
        )
    );

    return Promise.all( promises_to_promises )
    .then( array2_of_promise => {
        // We can now know how many orders there are, although we may only
        // have a promise to each order not the order itself.
        const order_promises: Promise<IOrder>[] = [];
        array2_of_promise.forEach( promises => {
            promises.forEach( (promise: Promise<IOrder>) => {
                order_promises.push(promise);
            });
        });
        return order_promises;
    });
}

export function getOrdersByYear(
    years: number[],
    scheduler: request_scheduler.IRequestScheduler,
    latest_year: number,
    date_filter: DateFilter,
): Promise<Promise<IOrder>[]> {
    // At return time we may not know how many orders there are, only
    // how many years in which orders have been queried for.
    return Promise.all(
        years.map(
            function(year: number): Promise<Promise<IOrder>[]> {
                const nocache_top_level = (year == latest_year);
                return fetchYear(
                  year, scheduler, nocache_top_level, date_filter);
            }
        )
    ).then(
        (a2_of_o_promise: Promise<IOrder>[][]) => {
            // Flatten the array of arrays of Promise<Order> into
            // an array of Promise<Order>.
            const order_promises: Promise<IOrder>[] = [];
            a2_of_o_promise.forEach(
                (year_order_promises: Promise<IOrder>[]) => {
                    year_order_promises.forEach(
                        (order_promise: Promise<IOrder>) => {
                            order_promises.push(order_promise);
                        }
                    );
                }
            );
            return order_promises;
        }
    );
}

export async function getOrdersByRange(
  start_date: Date,
  end_date: Date,
  scheduler: request_scheduler.IRequestScheduler,
  latest_year: number,
  date_filter: DateFilter,
): Promise<Promise<IOrder>[]> {
  console.assert(start_date < end_date);
  const start_year = start_date.getFullYear();
  const end_year = end_date.getFullYear();

  let years: number[] = []
  for (let y=start_year; y<=end_year; y++) {
    years.push(y);
  }

  const order_years = years.map(
      year => {
        const nocache_top_level = latest_year == year;
        return fetchYear(year, scheduler, nocache_top_level, date_filter)
      }
  );

  const unflattened = await util.get_settled_and_discard_rejects(order_years);
  const flattened_promises: Promise<IOrder>[] = unflattened.flat();
  const settled: IOrder[] = await util.get_settled_and_discard_rejects(flattened_promises);

  const f_in_date_window = async function(order: IOrder): Promise<boolean> {
    const order_date = await order.date();
    if (order_date) {
      return start_date <= order_date && order_date <= end_date;
    } else {
      return false;
    }
  }

  const filtered_orders: IOrder[] = await util.filter_by_async_predicate(
    settled,
    f_in_date_window,
  );

  // Wrap each order in a promise to match getOrdersByYear return signature.
  return filtered_orders.map(o => Promise.resolve(o));
}

function throw_order_discarded_error(order_id: string|null): void {
  const ode = new Error('OrderDiscardedError:' + order_id);
  throw ode;
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
};

export async function assembleDiagnostics(order: IOrder)
  : Promise<Record<string,any>>
{
    const diagnostics: Record<string, any> = {};
    const field_names: (keyof IOrder)[] = [
        'id',
        'list_url',
        'detail_url',
        'payments_url',
        'date',
        'total',
        'who',
    ];
    field_names.forEach(
        ((field_name: keyof IOrder) => {
            const value: any = order[field_name];
            diagnostics[<string>(field_name)] = value;
        })
    );

    const sync_order: ISyncOrder = await (order as Order).sync();

    diagnostics['items'] = await get_legacy_items(order);

    return Promise.all([
        signin.checkedFetch( util.defaulted(sync_order.list_url, '') )
            .then( response => response.text())
            .then( text => { diagnostics['list_html'] = text; } ),
        signin.checkedFetch( util.defaulted(sync_order.detail_url, '') )
            .then( response => response.text() )
            .then( text => { diagnostics['detail_html'] = text; } ),
        signin.checkedFetch(util.defaulted(sync_order.payments_url, ''))
            .then( response => response.text() )
            .then( text => { diagnostics['invoice_html'] = text; } )
    ]).then(
        () => diagnostics,
        error_msg => {
            notice.showNotificationBar(error_msg, document);
            return diagnostics;
        }
    );
}

export function create(
    header: order_header.IOrderHeader,
    scheduler: request_scheduler.IRequestScheduler,
    date_filter: DateFilter,
): IOrder|null {
    try {
      const impl = new OrderImpl(
        header,
        scheduler,
        date_filter,
      );
      const wrapper = new Order(impl);
      return wrapper;
    } catch(err) {
      console.log('order.create caught: ' + err + '; returning null')
      return null;
    }
}

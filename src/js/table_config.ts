/* Copyright(c) 2024,2025 Philip Mulcahy. */

import * as azad_entity from './entity';
import * as azad_item from './item';
import * as azad_order from './order';
import * as colspec from './colspec';
import * as datatable_wrap from './datatable_wrap';
import {dateToDateIsoString} from './date';
import * as order_util from './order_util';
import * as settings from './settings';
import * as shipment from './shipment';
import * as transaction from './transaction';
import * as urls from './url';
import * as util from './util';


export function getCols(table_type: string): Promise<colspec.ColSpec[]> {
  const waits: Promise<any>[] = [];
  const results: colspec.ColSpec[] = [];

  // TODO: this should be a(n) map/object and lookup func.
  const cols: colspec.ColSpec[] = (table_type == 'orders') ?
    ORDER_COLS :
    (table_type == 'items') ?
      ITEM_COLS :
      (table_type == 'shipments') ?
        SHIPMENT_COLS :
        (table_type == 'transactions') ?
          TRANSACTION_COLS :
          (() => {throw('unsupported table_type: ' + table_type);})();

  cols.forEach( col => {
    if (col?.sites?.test(urls.getSite()) ?? true) {
      const visible_promise = col.visibility ?
        col.visibility() :
        Promise.resolve(true);
      waits.push(visible_promise);
      visible_promise.then( visible => {
        if ( visible ) {
          results.push( col );
        }
      });
    }
  });

  /* eslint-disable */
  return Promise.all(waits).then( _ => results );
  /* eslint-enable */
}

const TAX_HELP = 'Caution: tax is often missing when not supplied by Amazon, cancelled, or pre-order.';

async function category_enabled(): Promise<boolean> {
  let show_category_in_items_view = true;
  try {
    show_category_in_items_view = await settings.getBoolean(
      'show_category_in_items_view');
  } catch(ex) {
    console.log(
      'category_enabled() caught', ex, ' - maybe it has never been set?');
  }
  return show_category_in_items_view;
}

async function shipment_info_enabled(): Promise<boolean> {
  const show_shipment_info = await settings.getBoolean('show_shipment_info');
  const preview_features_authorised = await settings.getBoolean(
    'preview_features_enabled');
  return show_shipment_info && preview_features_authorised;
}

const ORDER_COLS: colspec.ColSpec[] = [
  {
    field_name: 'order id',
    render_func:
      async function (order: azad_entity.IEntity, td: HTMLElement) {
        const o = (order as azad_order.IOrder);
        const id = await o.id();
        const detail_url = await o.detail_url();
        td.innerHTML = util.safe_new_tab_link(detail_url, id);
      },
    is_numeric: false,
  },
  {
    field_name: 'order url',
    value_promise_func_name: 'detail_url',
    is_numeric: false,
    hide_in_browser: true,
  },
  {
    field_name: 'items',
    render_func:
      async function(order: azad_entity.IEntity, td: HTMLElement) {
        const o = (order as azad_order.IOrder);
        const items = await azad_order.get_legacy_items(o);
        const ul = td.ownerDocument!.createElement('ul');
        for(const title in items) {
          if (Object.prototype.hasOwnProperty.call(items, title)) {
            const li = td.ownerDocument!.createElement('li');
            ul.appendChild(li);
            li.innerHTML = util.safe_new_tab_link(items[title], title + '; ');
          }
        }
        td.textContent = '';
        td.appendChild(ul);
        return null;
      },
    is_numeric: false,
  },
  // {
  //     field_name: 'shipment_derived_items',
  //     render_func: async function(
  //       order: azad_entity.IEntity,
  //       td: HTMLElement
  //     ) {
  //       const shipments = await (order as azad_order.IOrder).shipments();
  //       const items = shipments.map(s => s.items).flat();
  //       const ul = td.ownerDocument!.createElement('ul');
  //       td.textContent = '';
  //       td.appendChild(ul);
  //       items.forEach(items => {
  //         const li = td.ownerDocument!.createElement('li');
  //         ul.appendChild(li);
  //         const item_string = JSON.stringify(items);
  //         li.textContent = item_string;
  //       });
  //       return null;
  //     },
  //     is_numeric: false,
  // visibility: ()=>Promise.resolve(false),
  // },
  {
    field_name: 'item_reconciliation',
    render_func: async function(
      order: azad_entity.IEntity,
      td: HTMLElement,
    ) {
      const o = (order as azad_order.IOrder);
      const normalise_items = function(items: azad_item.IItem[]): Set<string> {
        return new Set(items.sort(
          (a: azad_item.IItem,
           b: azad_item.IItem) => a.description.localeCompare(b.description)
        ).map(item => item.description));
      };
      const shipments = await o.shipments();
      const merged_items = normalise_items(await o.item_list());
      const shipment_items = normalise_items(shipments.map(s => s.items).flat());

      const missing_in_merged = Array.from(shipment_items)
        .filter( i => !merged_items.has(i) );
      const missing_in_shipments = Array.from(merged_items)
        .filter( i => !shipment_items.has(i) );

      td.textContent = '';
      const doc = td.ownerDocument;
      const table = doc!.createElement('table');
      const row = doc!.createElement('row');
      td.appendChild(table);
      table.appendChild(row);
      function populate_list(
        row: HTMLElement,
        items: string[],
        header: string
      ) {
        const td = doc!.createElement('td');
        row.appendChild(td);
        const ul = doc!.createElement('ul');
        td.appendChild(ul);
        function append_item(s: string) {
          const li = doc!.createElement('li');
          li.textContent = s;
          ul.appendChild(li);
        }
        append_item(header);
        items.forEach(item => {
          append_item(item);
        });
      }
      populate_list(row, missing_in_merged, 'missing from merged');
      populate_list(row, missing_in_shipments, 'missing from shipments');
      return null;
    },
    is_numeric: false,
    visibility: ()=>Promise.resolve(false),
  }, {
    field_name: 'shipments',
    render_func: async function(order: azad_entity.IEntity, td: HTMLElement) {
      const shipments = await (order as azad_order.IOrder).shipments();
      const ul = td.ownerDocument!.createElement('ul');
      td.textContent = '';
      td.appendChild(ul);
      shipments.forEach(s => {
        const li = td.ownerDocument!.createElement('li');
        ul.appendChild(li);
        const t = s.transaction;
        const html = 'delivered: ' + shipment.Delivered[s.delivered] +
          '; status: ' + s.status + (
            s.tracking_link != '' ?
              '; ' + util.safe_new_tab_link(s.tracking_link, 'tracking link') :
              ''
          ) + (
            t ?
              ('; transaction: ' + t.payment_amount + ' ' + t.info_string) :
              ''
          );
        li.innerHTML = html;
      });
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'to',
    value_promise_func_name: 'who',
    is_numeric: false,
  }, {
    field_name: 'date',
    render_func:
      async function(
        entity: azad_entity.IEntity,
        td: HTMLElement
      ): Promise<null> {
        const order = entity as azad_order.IOrder;
        const d: Date|null = await order.date();
        td.innerHTML = d ? dateToDateIsoString(d): '?';
        return null;
      },
    is_numeric: false,
  }, {
    field_name: 'total',
    value_promise_func_name: 'total',
    is_numeric: true,
  }, {
    field_name: 'shipping',
    value_promise_func_name: 'postage',
    is_numeric: true,
    help: 'If there are only N/A values in this column, your login session' +
      ' may have partially expired, meaning you (and the extension) cannot' +
      ' fetch order details. Try clicking on one of the order links in the' +
      ' left hand column and then retrying the extension button you' +
      ' clicked to get here.',
  }, {
    field_name: 'shipping_refund',
    value_promise_func_name: 'postage_refund',
    is_numeric: true,
    help: 'If there are only N/A values in this column, your login session' +
      ' may have partially expired, meaning you (and the extension) cannot' +
      ' fetch order details. Try clicking on one of the order links in the' +
      ' left hand column and then retrying the extension button you' +
      ' clicked to get here.',
  }, {
    field_name: 'gift',
    value_promise_func_name: 'gift',
    is_numeric: true,
  }, {
    field_name: 'VAT',
    value_promise_func_name: 'vat',
    is_numeric: true,
    help: TAX_HELP,
    sites: new RegExp('amazon(?!.com)'),
  }, {
    field_name: 'tax',
    value_promise_func_name: 'us_tax',
    is_numeric: true,
    help: TAX_HELP,
    sites: new RegExp('\\.com$'),
  }, {
    field_name: 'GST',
    value_promise_func_name: 'gst',
    is_numeric: true,
    help: TAX_HELP,
    sites: new RegExp('\\.ca$'),
  }, {
    field_name: 'PST',
    value_promise_func_name: 'pst',
    is_numeric: true,
    help: TAX_HELP,
    sites: new RegExp('\\.ca$'),
  }, {
    field_name: 'subscribe & save',
    value_promise_func_name: 'subscribe_and_save',
    is_numeric: true,
    sites: new RegExp('\\.(ca|.com|.co.uk)'),
  }, {
    field_name: 'refund',
    value_promise_func_name: 'refund',
    is_numeric: true,
  }, {
    field_name: 'payments',
    render_func: (order: azad_entity.IEntity, td: HTMLElement) => {
      // TODO replace then with await
      return (order as azad_order.IOrder).payments().then( payments => {
        const ul = td.ownerDocument!.createElement('ul');
        td.textContent = '';

        payments.forEach( async (payment: any) => {
          const li = document.createElement('li');
          ul.appendChild(li);
          const detail_url = await (order as azad_order.IOrder).detail_url();

          li.innerHTML = util.safe_new_tab_link(
            detail_url,
            (payment ? payment : '-') + '; '
          );
        });
        datatable_wrap.invalidate();
        td.appendChild(ul);
        return null;
      });
    },
    is_numeric: false,
  }, {
    field_name: 'invoice',
    render_func: (order: azad_entity.IEntity, td: HTMLElement) => {
      return (order as azad_order.IOrder).invoice_url().then( url => {
        if ( url ) {
          td.innerHTML = util.safe_new_tab_link(url, url);
        } else {
          td.textContent = '';
        }
        return null;
      });
    },
    is_numeric: false,
    visibility: () => settings.getBoolean('show_invoice_links'),
  }
];

const ITEM_COLS: colspec.ColSpec[] = [
  {
    field_name: 'order id',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const item = entity as azad_item.IItem;
      const order_id = item.order_header.id;
      const order_detail_url = item.order_header.detail_url;
      td.innerHTML = util.safe_new_tab_link(order_detail_url, order_id);
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'order url',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const item = entity as azad_item.IItem;
      const order_detail_url = item.order_header.detail_url;
      td.innerHTML = order_detail_url;
      return Promise.resolve(null);
    },
    is_numeric: false,
    hide_in_browser: true,
  }, {
    field_name: 'order date',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const item = entity as azad_item.IItem;
      const date = item.order_header.date;
      td.innerHTML = date ? dateToDateIsoString(date): '?';
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'quantity',
    value_promise_func_name: 'quantity',
    is_numeric: false,
  }, {
    field_name: 'description',
    render_func:
      function (entity: azad_entity.IEntity, td: HTMLElement): Promise<null> {
        const item = entity as azad_item.IItem;
        td.innerHTML = util.safe_new_tab_link(item.url, item.description);
        return Promise.resolve(null);
      },
    is_numeric: false,
  }, {
    field_name: 'item url',
    value_promise_func_name: 'url',
    is_numeric: false,
    hide_in_browser: true,
  }, {
    field_name: 'price',
    value_promise_func_name: 'price',
    is_numeric: false,
  }, {
    field_name: 'subscribe & save',
    value_promise_func_name: 'subscribe_and_save',
    is_numeric: true
  }, {
    field_name: 'ASIN',
    value_promise_func_name: 'asin',
    is_numeric: false,
  }, {
    field_name: 'category',
    value_promise_func_name: 'category',
    is_numeric: false,
    visibility: category_enabled,
  }, {
    field_name: 'delivered',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      td.textContent = shipment.Delivered[s.delivered];
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'shipping status',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      td.textContent = s.status;
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'transaction',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      const t = s.transaction;
      if (t != null) {
        const ts = t.info_string + ': ' + t.payment_amount;
        td.textContent = ts;
      } else {
        td.textContent = '';
      }
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'tracking link',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      const l = s.tracking_link;
      if (l != null && l != '') {
        td.innerHTML = util.safe_new_tab_link(
          s.tracking_link, s.tracking_link
        );
      } else {
        td.textContent = '';
      }
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'tracking id',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      const id = s.tracking_id;
      td.textContent = id;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'shipment id',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = item as order_util.IEnrichedItem;
      const s = ei.shipment;
      const id = s.shipment_id;
      td.textContent = id;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  },
];

const SHIPMENT_COLS: colspec.ColSpec[] = [
  {
    field_name: 'shipment id',
    render_func: function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const shipment = entity as order_util.IEnrichedShipment;
      const shipment_id = shipment.shipment_id;
      td.innerHTML = shipment_id;
      return Promise.resolve(null);
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'order id',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const shipment = entity as order_util.IEnrichedShipment;
      const order_id: string = shipment.order.id;
      const order_detail_url = shipment.order.detail_url;
      td.innerHTML = util.safe_new_tab_link(order_detail_url, order_id);
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'order url',
    render_func: function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const shipment = entity as order_util.IEnrichedShipment;
      const order_detail_url = shipment.order.detail_url;
      td.innerHTML = order_detail_url;
      return Promise.resolve(null);
    },
    is_numeric: false,
    hide_in_browser: true,
  }, {
    field_name: 'order date',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const shipment = entity as order_util.IEnrichedShipment;
      const order_date = shipment.order.date;
      td.innerHTML = order_date ? dateToDateIsoString(order_date): '?';
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'delivered',
    render_func: async function(shipment_obj: azad_entity.IEntity, td: HTMLElement) {
      const s = shipment_obj as order_util.IEnrichedShipment;
      const statusString = shipment.Delivered[s.delivered];
      td.textContent = statusString;
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'shipping status',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const s = await (item as order_util.IEnrichedShipment);
      td.textContent = s.status;
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'tracking link',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const s = await (item as order_util.IEnrichedShipment);
      const l = s.tracking_link;
      if (l != null && l != '') {
        td.innerHTML = util.safe_new_tab_link(
          s.tracking_link, s.tracking_link
        );
      } else {
        td.textContent = '';
      }
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  }, {
    field_name: 'tracking id',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const s = await (item as order_util.IEnrichedShipment);
      const id = s.tracking_id;
      td.textContent = id;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  },
];

const TRANSACTION_COLS: colspec.ColSpec[] = [
  {
    field_name: 'date',
    render_func: function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const t = entity as transaction.Transaction;
      const date = new Date(t.date.toString());
      const ds = dateToDateIsoString(date);
      td.innerHTML = ds;
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'order ids',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const t = entity as transaction.Transaction;
      const ids: string[] = t.orderIds;
      const site = urls.getSite();

      const links = ids.map(id => {
        const url = urls.getDefaultOrderDetailUrl(id, site);
        const link = util.safe_new_tab_link(url, id);
        const isLastOne = id == ids.at(-1);
        const separator = isLastOne ? '' : ', ';
        const listItem = `<li>${link}${separator}</li>`;
        return listItem;
      }).join('');

      const list = '<ul>' + links + '</ul>';
      td.innerHTML = list;
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'order urls',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const t = entity as transaction.Transaction;
      const ids: string[] = t.orderIds;
      const site = urls.getSite();

      const urlList = ids.map(id => {
        const url = urls.getDefaultOrderDetailUrl(id, site);
        return url;
      }).join(', ');

      td.innerText = urlList;
      return Promise.resolve(null);
    },
    is_numeric: false,
    hide_in_browser: true,
  },
  {
    field_name: 'vendor',
    render_func: function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const transaction = entity as transaction.Transaction;
      const vendor = transaction.vendor;
      td.innerHTML = vendor;
      return Promise.resolve(null);
    },
    is_numeric: false,
    hide_in_browser: true,
  }, {
    field_name: 'card_details',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const transaction = entity as transaction.Transaction;
      const cardInfo = transaction.cardInfo;
      td.innerHTML = cardInfo;
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'amount',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const transaction = entity as transaction.Transaction;
      const amount = transaction.amount;
      td.innerText = amount.toString();
      return Promise.resolve(null);
    },
    is_numeric: true,
  },
];

/* Copyright(c) 2016-2021 Philip Mulcahy. */

const $ = require('jquery');
import 'datatables';
import * as azad_entity from './entity';
import * as azad_item from './item';
import * as azad_order from './order';
import * as order_util from './order_util';
import * as csv from './csv';
import * as diagnostic_download from './diagnostic_download';
import * as item from './item';
import * as notice from './notice';
import * as progress_bar from './progress_bar';
import * as settings from './settings';
import * as shipment from './shipment';
import * as sprintf from 'sprintf-js';
import * as stats from './statistics';
import * as urls from './url';
import * as util from './util';

'use strict';

// TODO remove references to settings module from this file,
// and instead build a TableSettings class that can be passed around.
// e.g. less spooky action at a distance.

let datatable: any = null;
const order_map: Record<string, azad_order.IOrder> = {};
let progress_indicator: progress_bar.IProgressIndicator|null = null;

const TAX_HELP = 'Caution: tax is often missing when not supplied by Amazon, cancelled, or pre-order.';

interface ColSpec {
  field_name: string;

  // Yes: using IEntity here means a tonne of downcasting in the implementations.
  // The alternatives seem (to me) worse.
  render_func?: (
    entity: azad_entity.IEntity, td: HTMLElement) => Promise<null|void>;

  is_numeric: boolean;
  value_promise_func_name?: string;
  help?: string;
  sites?: RegExp;
  visibility?: () => Promise<boolean>;
  sum?: number;
  pageSum?: number;
  hide_in_browser?: boolean;
}

const ORDER_COLS: ColSpec[] = [
  {
    field_name: 'order id',
    render_func:
      (order: azad_entity.IEntity, td: HTMLElement) => (order as azad_order.IOrder).id().then(
        id => (order as azad_order.IOrder).detail_url().then(
          url => {
            td.innerHTML = '<a href="' + url + '">' + id + '</a>';
            return null;
          }
        )
    ),
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
    render_func: (order: azad_entity.IEntity, td: HTMLElement) =>
    azad_order.get_legacy_items(order as azad_order.IOrder).then( items => {
      const ul = td.ownerDocument!.createElement('ul');
      for(const title in items) {
        if (Object.prototype.hasOwnProperty.call(items, title)) {
          const li = td.ownerDocument!.createElement('li');
          ul.appendChild(li);
          const a = td.ownerDocument!.createElement('a');
          li.appendChild(a);
          a.textContent = title + '; ';
          a.href = items[title];
        }
      }
      td.textContent = '';
      td.appendChild(ul);
      return null;
    }),
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
      td: HTMLElement
    ) {
      const normalise_items = function(items: azad_item.IItem[]): Set<string> {
        return new Set(items.sort(
          (a: item.IItem,
           b: item.IItem) => a.description.localeCompare(b.description)
        ).map(item => item.description));
      };
      const shipments = await (order as azad_order.IOrder).shipments();
      const merged_items = normalise_items(await (order as azad_order.IOrder).item_list());
      const shipment_items = normalise_items(shipments.map(s => s.items).flat());

      const missing_in_merged = Array.from(shipment_items).filter( i => !merged_items.has(i) );
      const missing_in_shipments = Array.from(merged_items).filter( i => !shipment_items.has(i) );

      td.textContent = '';
      const doc = td.ownerDocument;
      const table = doc!.createElement('table');
      const row = doc!.createElement('row');
      td.appendChild(table);
      table.appendChild(row);
      function populate_list(row: HTMLElement, items: string[], header: string) {
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
          '; status: ' + s.status +
          (s.tracking_link != '' ? '; <a href="' + s.tracking_link + '">tracking link</a>' : '') +
          (t ? ('; transaction: ' + t.payment_amount + ' ' + t.info_string) : '');
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
      (entity: azad_entity.IEntity, td: HTMLElement): Promise<null> => {
      const order = entity as azad_order.IOrder;
      return order.date().then((date: Date|null) => {
        td.innerHTML = date ? util.dateToDateIsoString(date): '?';
        return Promise.resolve(null);
      });
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
    field_name: 'refund',
    value_promise_func_name: 'refund',
    is_numeric: true,
  }, {
    field_name: 'payments',
    render_func: (order: azad_entity.IEntity, td: HTMLElement) => {
      return (order as azad_order.IOrder).payments().then( payments => {
        const ul = td.ownerDocument!.createElement('ul');
        td.textContent = '';
        payments.forEach( (payment: any) => {
          const li = document.createElement('li');
          ul.appendChild(li);
          const a = document.createElement('a');
          li.appendChild(a);
          // Replace unknown/none with "-" to make it look uninteresting.
          if (!payment) {
            a.textContent = '-';
          } else {
            a.textContent = payment + '; ';
          }
          (order as azad_order.IOrder).detail_url().then(
            detail_url => a.setAttribute( 'href', detail_url)
          );
        });
        if(datatable) {
          datatable.rows().invalidate();
          datatable.draw();
        }
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
          const link = td.ownerDocument!.createElement('a');
          link.textContent = url;
          link.setAttribute('href', url);
          td.textContent = '';
          td.appendChild(link);
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

const ITEM_COLS: ColSpec[] = [
  {
    field_name: 'order id',
    render_func: async function(
      entity: azad_entity.IEntity,
      td: HTMLElement
    ): Promise<null> {
      const item = entity as azad_item.IItem;
      const order_id = item.order_header.id;
      const order_detail_url = item.order_header.detail_url;
      td.innerHTML = '<a href="' + order_detail_url +
        '">' + order_id + '</a>';
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
      const order_id = item.order_header.id;
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
      td.innerHTML = date ? util.dateToDateIsoString(date): '?';
      return Promise.resolve(null);
    },
    is_numeric: false,
  }, {
    field_name: 'quantity',
    value_promise_func_name: 'quantity',
    is_numeric: false,
  }, {
    field_name: 'description',
    render_func: (entity: azad_entity.IEntity, td: HTMLElement): Promise<null> => {
      const item = entity as azad_item.IItem;
      td.innerHTML = '<a href="' + item.url +
        '">' + item.description + '</a>';
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
    field_name: 'ASIN',
    value_promise_func_name: 'asin',
    is_numeric: false,
    visibility: asin_enabled
  },
  {
    field_name: 'delivered',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      td.textContent = shipment.Delivered[s.delivered];
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  },
  {
    field_name: 'shipping status',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      td.textContent = s.status;
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  },
  {
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
  },
  {
    field_name: 'tracking link',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      const l = s.tracking_link;
      if (l != null && l != '') {
        const a = td.ownerDocument.createElement('a');
        a.setAttribute('href', s.tracking_link);
        td.textContent = '';
        td.appendChild(a);
        a.textContent = s.tracking_link;
      } else {
        td.textContent = '';
      }
      return null;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  },
  {
    field_name: 'tracking id',
    render_func: async function(item: azad_entity.IEntity, td: HTMLElement) {
      const ei = await (item as order_util.IEnrichedItem);
      const s = ei.shipment;
      const id = s.tracking_id;
      td.textContent = id;
    },
    is_numeric: false,
    visibility: shipment_info_enabled,
  },
];

async function asin_enabled(): Promise<boolean> {
  const ezp_mode = await settings.getBoolean('ezp_mode');
  const show_asin_in_items_view = await settings.getBoolean('show_asin_in_items_view');
  return ezp_mode || show_asin_in_items_view;
}

async function shipment_info_enabled(): Promise<boolean> {
  const show_shipment_info = await settings.getBoolean('show_shipment_info');
  const preview_features_authorised = await settings.getBoolean('preview_features_enabled');
  return show_shipment_info && preview_features_authorised;
}

function getCols(
    items_not_orders: boolean
): Promise<ColSpec[]> {
  const waits: Promise<any>[] = [];
  const results: ColSpec[] = [];
  const cols = items_not_orders ? ITEM_COLS : ORDER_COLS;
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

function appendCell(
  tr: HTMLTableRowElement,
  entity: azad_entity.IEntity,
  col_spec: ColSpec,
): Promise<null|void> {
  const td = document.createElement('td');
  td.textContent = 'pending';
  tr.appendChild(td);
  const null_converter = function(x: any): any {
    if (x) {
      if (
        typeof(x) === 'string' &&
        parseFloat(x.replace(/^([£$]|CAD|EUR|GBP) */, '')
    .replace(/,/, '.')
                  ) + 0 == 0
      ) {
        return 0;
      } else {
        return x;
      }
    } else if (x == 0) {
      return 0;
    } else {
      return '';
    }
  };
  const value_written_promise: Promise<null|void> =
    col_spec.render_func ?
    col_spec?.render_func(entity, td) :
    (() => {
    const field_name: string | undefined = col_spec.value_promise_func_name;
    if (typeof(field_name) == 'undefined') {
      const msg = 'empty field name not expected';
      console.error(msg);
      throw(msg);
    }
    const field: azad_entity.Field = azad_entity.field_from_entity(entity, <string>field_name);
    const value_promise: Promise<azad_entity.Value> = (
      typeof(field) === 'function'
    ) ?
      field.bind(entity)() :
      Promise.resolve(field);
    return value_promise
    .then(null_converter)
    .then(
      (value: string) => {
        td.innerText = value;
        if(datatable) {
          datatable.rows().invalidate();
          datatable.draw();
        }
        return null;
      }
    );
  })();
  td.setAttribute('class', td.getAttribute('class') + ' ' +
                  'azad_col_' + col_spec.field_name + ' ' +
                  'azad_numeric_' + (col_spec.is_numeric ? 'yes' : 'no' ) + ' ');
  if (col_spec.help) {
    td.setAttribute(
      'class',
      td.getAttribute('class') + 'azad_elem_has_help '
    );
    td.setAttribute('title', col_spec.help);
  }
  // order.id().then( id => {
  //     if (id == '203-4990948-9075513' && col_spec.field_name == 'postage') {
  //         value_written_promise.then(() => console.log('written promise resolved'));
  //     }
  // })
  return value_written_promise;
}

function appendEntityRow(
  table: HTMLElement,
  entity: azad_entity.IEntity,
  cols: Promise<ColSpec[]>
): Promise<Promise<null|void>[]> {
  const tr = document.createElement('tr');
  table.appendChild(tr);
  return cols.then( cols =>
                   cols.map( col_spec => appendCell(tr, entity, col_spec) )
                  );
}

function addOrderTable(
  doc: HTMLDocument,
  orders: azad_order.IOrder[],
  cols: Promise<ColSpec[]>
): Promise<HTMLTableElement> {
  return addTable(doc, orders, cols);
}

async function addItemTable(
  doc: HTMLDocument,
  orders: azad_order.IOrder[],
  cols: Promise<ColSpec[]>
): Promise<HTMLTableElement> {
  const items = await order_util.enriched_items_from_orders(orders);
  return addTable(doc, items, cols);
}

async function addTable(
    doc: HTMLDocument,
    entities: azad_entity.IEntity[],
    cols: Promise<ColSpec[]>
): Promise<HTMLTableElement> {
  const addHeader = function(row: HTMLElement, value: string, help: string) {
    const th = row.ownerDocument!.createElement('th');
    th.setAttribute('class', ' azad_thClass ');
    row.appendChild(th);
    th.textContent = value;
    if( help ) {
      th.setAttribute(
        'class', th.getAttribute('class') + 'azad_th_has_help ');
        th.setAttribute('title', help);
    }
    return th;
  };

  // remove any old table
  let table: HTMLTableElement = <HTMLTableElement>doc.querySelector(
    '[id="azad_order_table"]'
  );
  if ( table !== null ) {
    console.log('removing old table');
    table.parentNode!.removeChild(table);
    console.log('removed old table');
  }
  console.log('adding table');
  table = <HTMLTableElement>doc.createElement('table');
  console.log('added table');
  document.body.appendChild(table);
  table.setAttribute('id', 'azad_order_table');
  table.setAttribute(
    'class', 'azad_table stripe compact hover order-column ');

    const thead = doc.createElement('thead');
    thead.setAttribute('id', 'azad_order_table_head');
    table.appendChild(thead);

    const hr = doc.createElement('tr');
    hr.setAttribute('id', 'azad_order_table_hr');
    thead.appendChild(hr);

    const tfoot = doc.createElement('tfoot');
    tfoot.setAttribute('id', 'azad_order_table_foot');
    table.appendChild(tfoot);

    const fr = doc.createElement('tr');
    fr.setAttribute('id', 'azad_order_table_fr');
    tfoot.appendChild(fr);

    const actual_cols = await cols;
    actual_cols.forEach( col_spec => {
      addHeader(hr, col_spec.field_name, col_spec?.help ?? '');
      addHeader(fr, col_spec.field_name, col_spec?.help ?? '');
    });

    const tbody = doc.createElement('tbody');
    table.appendChild(tbody);

    // Record all the promises: we're going to need to wait on all of them
    // to resolve before we can hand over the table to our callers.
    const row_done_promises = entities.map( entity => {
      return appendEntityRow(tbody, entity, cols);
    });

    const row_promises = await Promise.all(row_done_promises);
    const value_done_promises: Promise<null|void>[] = [];
    row_promises.forEach(
      cell_done_promises => value_done_promises.push(
        ...cell_done_promises
      )
    );
    console.log(
      'value_done_promises.length',
      value_done_promises.length
    );
    return Promise.allSettled(value_done_promises).then( settled => {
      const rejected_count = settled.filter(row => row.status == 'rejected')
      .length;
      if (rejected_count) {
        console.warn('table.addTable(...) encountered ', rejected_count, ' rejected value promises.');
      }
      return table;
    });
}

async function reallyDisplay(
  orders: azad_order.IOrder[],
  beautiful: boolean,
  items_not_orders: boolean,
): Promise<HTMLTableElement> {
  console.log('amazon_order_history_table.reallyDisplay starting');
  for (const entry in order_map) {
    delete order_map[entry];
  }
  orders.forEach( order => {
    order.id().then(
      id => { order_map[id] = order; }
    );
  });
  util.clearBody();
  addProgressBar();
  const cols = getCols(items_not_orders);
  const table_promise = items_not_orders ?
    addItemTable(document, orders, cols) :
    addOrderTable(document, orders, cols);

  // Wait for table to be there before doing more html stuff.
  const _table = await table_promise;

  $( () => {
    if (beautiful) {
      if (datatable) {
        datatable.destroy();
      }
      util.removeButton('data table');
      util.addButton(
        'plain table',
        function() { display(orders, false, items_not_orders); },
        'azad_table_button'
      );
      addCsvButton(orders, items_not_orders);
      datatable = (<any>$('#azad_order_table')).DataTable({
        'bPaginate': true,
        'lengthMenu': [
          [10, 25, 50, 100, -1],
          [10, 25, 50, 100, 'All'] ],
        'footerCallback': function() {
          const api = this.api();
          // Remove the formatting to get integer data for summation
          const floatVal = function(v: string | number): number {
            const parse = function(i: string | number): number {
              try {
                if(typeof i === 'string') {
                  return (
                    i === 'N/A' ||
                      i === '-' ||
                      i === 'pending'
                  ) ?
                    0 :
                    parseFloat(
                      i.replace(
                        /^([£$]|AUD|CAD|EUR|GBP|USD) */,
                        ''
                      ).replace(/,/, '.')
                    );
                }
                if(typeof i === 'number') { return i; }
              } catch (ex) {
                console.warn(ex);
              }
              return 0;
            };
            const candidate = parse(v);
            if (isNaN(candidate)) {
              return 0;
            }
            return candidate;
          };
          let col_index = 0;
          cols.then( cols => cols.forEach( col_spec => {
            const sum_col = function(col: any) {
              const data = col.data();
              if (data) {
                const sum = data
                .map( (v: string | number) => floatVal(v) )
                .reduce( (a: number, b: number) => a + b, 0 );
                return floatVal(sum);
              } else {
                return 0;
              }
            };
            if(col_spec.is_numeric) {
              col_spec.sum = sum_col(api.column(col_index));
              col_spec.pageSum = sum_col(
                api.column(col_index, {page: 'current'}));
                $(api.column(col_index).footer()).html(
                  sprintf.sprintf(
                    'page=%s; all=%s',
                    col_spec.pageSum.toFixed(2),
                    col_spec.sum.toFixed(2))
                );
            }
            col_index += 1;
          }));
        }
      });
    } else {
      util.removeButton('plain table');
      util.addButton(
        'data table',
        function() { display(orders, true, items_not_orders); },
        'azad_table_button'
      );
      addCsvButton(orders, items_not_orders);
    }
  });

  console.log('azad.reallyDisplay returning');
  return table_promise;
}

function addProgressBar(): void {
  progress_indicator = progress_bar.addProgressBar(document.body);
}

function addCsvButton(
  orders: azad_order.IOrder[],
  items_not_orders: boolean): void
{
  const title = "download spreadsheet ('.csv')";
  util.addButton(
    title,
    async function() {
      const table: HTMLTableElement = await display(orders,
                                                    false,
      items_not_orders);
      const show_totals: boolean = await settings.getBoolean(
        'show_totals_in_csv');
        csv.download(table, show_totals);
    },
    'azad_table_button'
  );
}

export async function display(
  orders: azad_order.IOrder[],
  beautiful: boolean,
  items_not_orders: boolean,
): Promise<HTMLTableElement> {
  console.log('amazon_order_history_table.display starting');
  const table_promise: Promise<HTMLTableElement> = reallyDisplay(
    orders,
    beautiful,
    items_not_orders
  );
  console.log(
    'amazon_order_history_table.display then func returning ' +
      'table promise.'
  );
  console.log('amazon_order_history_table.display returning');
  return table_promise;
}

export function dumpOrderDiagnostics(order_id: string) {
  console.log('dumpOrderDiagnostics: ' + order_id);
  const order = order_map[order_id];
  if (order) {
    const utc_today = new Date().toISOString().substr(0,10);
    const file_name = order_id + '_' + utc_today + '.json';
    azad_order.assembleDiagnostics(order).then(
      diagnostics => diagnostic_download.save_json_to_file(
        diagnostics,
        file_name
      )
    ).then(
    () => notice.showNotificationBar(
      'Debug file ' + file_name + ' saved.',
      document
    ),
    err => {
      const msg = 'Failed to create debug file: ' + file_name +
        ' ' + err;
      console.warn(msg);
      notice.showNotificationBar(msg, document);
    }
    );
  }
}

export function updateProgressBar(statistics: stats.Statistics): void {
  if (progress_indicator) {
    const completed = statistics.get(stats.OStatsKey.COMPLETED_COUNT);
    const cache_hits = statistics.get(stats.OStatsKey.CACHE_HIT_COUNT);
    const queued = statistics.get(stats.OStatsKey.QUEUED_COUNT);
    const running = statistics.get(stats.OStatsKey.RUNNING_COUNT);
    if (completed!=null && queued!=null && running!=null) {
      const ratio: number = (completed + cache_hits) / (completed + queued + running + cache_hits);
      if (ratio) {
        progress_indicator.update_progress(ratio);
      }
    }
  }
}

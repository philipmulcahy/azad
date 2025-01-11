/* Copyright(c) 2016-2024 Philip Mulcahy. */

const $ = require('jquery');
import 'datatables';
import * as azad_entity from './entity';
import * as azad_order from './order';
import * as banner from './banner';
import * as order_util from './order_util';
import * as colspec from './colspec';
import * as csv from './csv';
import * as datatable_wrap from './datatable_wrap';
import * as diagnostic_download from './diagnostic_download';
import * as notice from './notice';
import * as progress_bar from './progress_bar';
import * as settings from './settings';
import * as transaction from './transaction';
import * as stats from './statistics';
import * as table_config from './table_config';
import * as util from './util';

'use strict';

// TODO remove references to settings module from this file,
// and instead build a TableSettings class that can be passed around.
// e.g. less spooky action at a distance.

const order_map: Record<string, azad_order.IOrder> = {};
let progress_indicator: progress_bar.IProgressIndicator|null = null;

function appendCell(
  tr: HTMLTableRowElement,
  entity: azad_entity.IEntity,
  col_spec: colspec.ColSpec,
): Promise<null|void> {
  const td = document.createElement('td');
  td.textContent = 'pending';
  tr.appendChild(td);

  const null_converter = function(x: any): any {
    if (x) {
      if (
        typeof(x) === 'string' &&
        parseFloat(
          x.replace(/^([£$]|CAD|EUR|GBP) */, '').replace(/,/, '.')
        ) + 0 == 0
      ) {
        return 0;
      } else {
        return x;
      }
    } else if (x == '') {
      return '';
    } else {
      return 0;
    }
  };

  const value_written_promise: Promise<null|void> =
    col_spec.render_func ?
    col_spec?.render_func(entity, td) :
    (
      () => {
        const field_name: string | undefined = col_spec.value_promise_func_name;

        if (typeof(field_name) == 'undefined') {
          const msg = 'empty field name not expected';
          console.error(msg);
          throw(msg);
        }

        const field: azad_entity.Field = azad_entity.field_from_entity(
          entity,
          <string>field_name);

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
              datatable_wrap.invalidate();
              return null;
            }
          );
      }
    )();

  td.setAttribute(
    'class', td.getAttribute('class') + ' ' +
    'azad_col_' + col_spec.field_name + ' ' +
    'azad_numeric_' + (col_spec.is_numeric ? 'yes' : 'no' ) + ' ');

  if (col_spec.help) {
    td.setAttribute(
      'class',
      td.getAttribute('class') + ' azad_elem_has_help');
    td.setAttribute('title', col_spec.help);
  }

  if (col_spec.hide_in_browser) {
    td.setAttribute( 'class', td.getAttribute('class') + ' azad_hidden');
  }

  return value_written_promise;
}

function appendEntityRow(
  table: HTMLElement,
  entity: azad_entity.IEntity,
  cols: Promise<colspec.ColSpec[]>
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
  cols: Promise<colspec.ColSpec[]>
): Promise<HTMLTableElement> {
  return addTable(doc, orders, cols);
}

async function addItemTable(
  doc: HTMLDocument,
  orders: azad_order.IOrder[],
  cols: Promise<colspec.ColSpec[]>
): Promise<HTMLTableElement> {
  const items = await order_util.enriched_items_from_orders(orders);
  return addTable(doc, items, cols);
}

async function addShipmentsTable(
  doc: HTMLDocument,
  orders: azad_order.IOrder[],
  cols: Promise<colspec.ColSpec[]>
): Promise<HTMLTableElement> {
  settings.getBoolean('');
  const shipments = await order_util.enriched_shipments_from_orders(orders);
  return addTable(doc, shipments, cols);
}

function addTransactionTable(
  doc: HTMLDocument,
  transactions: transaction.Transaction[],
  cols: Promise<colspec.ColSpec[]>
): Promise<HTMLTableElement> {
  return addTable(doc, transactions, cols);
}

async function addTable(
    doc: HTMLDocument,
    entities: azad_entity.IEntity[],
    cols: Promise<colspec.ColSpec[]>
): Promise<HTMLTableElement> {
  const addHeader = function(
    row: HTMLElement,
    value: string,
    help: string,
    hidden: boolean,
  ) {
    const th = row.ownerDocument!.createElement('th');
    th.setAttribute('class', 'azad_thClass');

    if (hidden) {
      th.setAttribute('class', th.getAttribute('class') + ' azad_hidden');
    }

    row.appendChild(th);
    th.textContent = value;

    if( help ) {
      th.setAttribute(
        'class', th.getAttribute('class') + ' azad_th_has_help ');
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
  'class', 'azad_table stripe compact hover order-column');

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
    const hidden: boolean = col_spec.hide_in_browser ? true: false;
    [hr, fr].forEach(
      parent_row => {
        addHeader(
          parent_row,
          col_spec.field_name,
          col_spec?.help ?? '',
          hidden);
      }
    );
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
      console.warn(
        'table.addTable(...) encountered ',
        rejected_count,
        'rejected value promises.');
    }
    return table;
  });
}

async function reallyDisplay(
  orders: azad_order.IOrder[],
  beautiful: boolean,
): Promise<HTMLTableElement> {
  console.log('amazon_order_history_table.reallyDisplay starting');

  for (const entry in order_map) {
    delete order_map[entry];
  }

  util.clearBody();
  banner.addBanner();
  addProgressBar();

  orders.forEach( order => {
    order.id().then(
      id => { order_map[id] = order; }
    );
  });
  
  const table_type = await settings.getString('azad_table_type');
  const cols = table_config.getCols(table_type);

  const table_promise = (table_type == 'orders') ?
    addOrderTable(document, orders, cols) :
    (table_type == 'items') ?
      addItemTable(document, orders, cols) :
      (table_type == 'shipments') ?
        addShipmentsTable(document, orders, cols) :
        (() => {throw('unsupported table_type: ' + table_type);})();

  // Wait for table to be there before doing more html stuff.
  const table = await table_promise;
  banner.removeBanner();

  $( () => {
    if (beautiful) {
      datatable_wrap.destroy();
      util.removeButton('data table');
      util.addButton(
        'plain table',
        function() { display(Promise.resolve(orders), false); },
        'azad_table_button'
      );
      addOrdersCsvButton(orders);
      datatable_wrap.init(cols);
    } else {
      util.removeButton('plain table');
      util.addButton(
        'data table',
        function() { display(Promise.resolve(orders), true); },
        'azad_table_button'
      );
      addOrdersCsvButton(orders);
    }
  });

  console.log('azad.reallyDisplay returning');
  return table;
}

async function reallyDisplayTransactions(
  transactions: transaction.Transaction[],
  beautiful: boolean,
): Promise<HTMLTableElement> {
  console.log('amazon_order_history_table.reallyDisplay starting');

  util.clearBody();
  banner.addBanner();
  
  const table_type = await settings.getString('azad_table_type');
  const cols = table_config.getCols(table_type);

  const table_promise = (table_type == 'transactions') ?
    addTransactionTable(document, transactions, cols) :
    (() => {throw('unsupported table_type: ' + table_type);})();

  // Wait for table to be there before doing more html stuff.
  const table = await table_promise;
  banner.removeBanner();

  $( () => {
    if (beautiful) {
      datatable_wrap.destroy();
      util.removeButton('data table');
      util.addButton(
        'plain table',
        () => displayTransactions(transactions),
        'azad_table_button'
      );
      addTransactionsCsvButton(transactions);
      datatable_wrap.init(cols);
    } else {
      util.removeButton('plain table');
      util.addButton(
        'data table',
        () => displayTransactions(transactions),
        'azad_table_button'
      );
      addTransactionsCsvButton(transactions);
    }
  });

  console.log('azad.reallyDisplay returning');
  return table;
}

function addProgressBar(): void {
  progress_indicator = progress_bar.addProgressBar(document.body);
}

function addOrdersCsvButton(orders: azad_order.IOrder[]): void
{
  const title = "download spreadsheet ('.csv')";

  util.addButton(
    title,
    async function() {
      const table: HTMLTableElement = await display(
        Promise.resolve(orders),
        false
      );

      const show_totals: boolean = await settings.getBoolean(
        'show_totals_in_csv'
      );

      csv.download(table, show_totals);
    },
    'azad_table_button'
  );
}

function addTransactionsCsvButton(transactions: transaction.Transaction[]): void
{
  const title = "download spreadsheet ('.csv')";

  util.addButton(
    title,
    async function() {
      const table: HTMLTableElement = await displayTransactions(transactions);

      const show_totals: boolean = await settings.getBoolean(
        'show_totals_in_csv'
      );

      csv.download(table, show_totals);
    },
    'azad_table_button'
  );
}

export async function display(
  orders_promise: Promise<azad_order.IOrder[]>,
  beautiful: boolean,
): Promise<HTMLTableElement> {
  const orders = await orders_promise;
  console.log('amazon_order_history_table.display starting');

  if (orders.length >= 500 && beautiful) {
    beautiful = false;

    notice.showNotificationBar(
      '500 or more orders found. That\'s a lot!\n' +
      'We\'ll start you off with a plain table to make display faster.\n' +
      'You can click the blue "datatable" button to restore sorting, filtering etc.',
      document
    );
  }

  const table_promise: Promise<HTMLTableElement> = reallyDisplay(
    orders,
    beautiful,
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
      const ratio: number = (completed + cache_hits) /
                            (completed + queued + running + cache_hits);

      if (ratio) {
        progress_indicator.update_progress(ratio);
      }
    }
  }
}

export async function displayTransactions(
  transactions: transaction.Transaction[],
): Promise<HTMLTableElement> {
  let beautiful = true;

  if (transactions.length >= 500) {
    beautiful = false;

    notice.showNotificationBar(
      '500 or more transactions found. That\'s a lot!\n' +
      'We\'ll start you off with a plain table to make display faster.\n' +
      'You can click the blue "datatable" button to restore sorting, filtering etc.',
      document
    );
  }

  const table_promise: Promise<HTMLTableElement> = reallyDisplayTransactions(
    transactions,
    beautiful,
  );

  console.log(
    'amazon_order_history_table.display then func returning ' +
      'table promise.'
  );

  console.log('amazon_order_history_table.display returning');
  return table_promise;

}

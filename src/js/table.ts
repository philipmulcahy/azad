/* Copyright(c) 2016-2020 Philip Mulcahy. */

const $ = require('jquery');
import 'datatables';
import * as azad_order from './order';
import * as csv from './csv';
import * as diagnostic_download from './diagnostic_download';
import * as notice from './notice';
import * as progress_bar from './progress_bar';
import * as settings from './settings';
import * as sprintf from 'sprintf-js';
import * as stats from './statistics';
import * as urls from './url';
import * as util from './util';

'use strict';

const CELL_CLASS = 'azad_cellClass ';
const ELEM_CLASS = 'azad_elemClass ';
const LINK_CLASS = 'azad_linkClass ';
const TH_CLASS = 'azad_thClass ';

let datatable: any = null;
const order_map: Record<string, azad_order.IOrder> = {};
let progress_indicator: progress_bar.IProgressIndicator|null = null;

/**
 * Add a td to the row tr element, and return the td.
 */
const addCell = function(row: any, value: any) {
    const td = row.ownerDocument.createElement('td');
    td.setAttribute('class', CELL_CLASS);
    row.appendChild(td);
    td.textContent = value;
    return td;
};

/**
 * Add a td to the row tr element, and return the td.
 */
const addElemCell = function(
        row: HTMLElement,
        elem: HTMLElement
): HTMLElement {
    const td: HTMLTableDataCellElement = row.ownerDocument!.createElement('td');
    td.setAttribute('class', ELEM_CLASS);
    row.appendChild(td);
    td.appendChild(elem);
    return td;
};

const TAX_HELP = 'Caution: tax is often not listed when stuff is not supplied by Amazon, is cancelled, or is pre-order.';

type RenderFunc = (order: azad_order.IOrder, td: HTMLElement) => Promise<void>;

const COLS: Record<string, any>[] = [
    {
        field_name: 'order id',
        render_func:
            (order: azad_order.IOrder, td: HTMLElement) => order.id().then(
                id => order.detail_url().then(
                    url => {
                        td.innerHTML = '<a href="' + url + '">' + id + '</a>';
                        return null;
                    }
                )
            ),
        is_numeric: false
    },
    {
        field_name: 'items',
        render_func: (order: azad_order.IOrder, td: HTMLElement) => 
            order.items().then( items => {
                const ul = td.ownerDocument!.createElement('ul');
                for(let title in items) {
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
        is_numeric: false
    },
    {
        field_name: 'to',
        value_promise_func: 'who',
        is_numeric: false
    },
    {
        field_name: 'date',
        value_promise_func: 'date',
        is_numeric: false,
    },
    {
        field_name: 'total',
        value_promise_func: 'total',
        is_numeric: true
    },
    {
        field_name: 'postage',
        value_promise_func: 'postage',
        is_numeric: true,
        help: 'If there are only N/A values in this column, your login session may have partially expired, meaning you (and the extension) cannot fetch order details. Try clicking on one of the order links in the left hand column and then retrying the extension button you clicked to get here.'
    },
    {
        field_name: 'gift',
        value_promise_func: 'gift',
        is_numeric: true
    },
    {
        field_name: 'VAT',
        value_promise_func: 'vat',
        is_numeric: true,
        help: TAX_HELP,
        sites: new RegExp('amazon(?!.com)')
    },
    {
        field_name: 'tax',
        value_promise_func: 'us_tax',
        is_numeric: true,
        help: TAX_HELP,
        sites: new RegExp('\\.com$')
    },
    {
        field_name: 'GST',
        value_promise_func: 'gst',
        is_numeric: true,
        help: TAX_HELP,
        sites: new RegExp('\\.ca$')
    },
    {
        field_name: 'PST',
        value_promise_func: 'pst',
        is_numeric: true,
        help: TAX_HELP,
        sites: new RegExp('\\.ca$')
    },
    {
        field_name: 'refund',
        value_promise_func: 'refund',
        is_numeric: true
    },
    {
        field_name: 'payments',
        render_func: (order: azad_order.IOrder, td: HTMLElement) => {
            return order.payments().then( payments => {
                const ul = td.ownerDocument!.createElement('ul');
                td.textContent = '';
                payments.forEach( (payment: any) => {
                    const li = document.createElement('li');
                    ul.appendChild(li);
                    const a = document.createElement('a');
                    li.appendChild(a);
                    // Replace unknown/none with "-" to make it look uninteresting.
                    if (!payment) {
                        a.textContent = '-'
                    } else {
                        a.textContent = payment + '; '
                    }
                    order.detail_url().then(
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
        is_numeric: false
    },
    {
        field_name: 'invoice',
        render_func: (order: azad_order.IOrder, td: HTMLElement) => {
            return order.invoice_url().then( url => {
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
        visibility: () => settings.getBoolean('show_invoice_links')
    }
]

function getCols(): Promise< Record<string, any>[] > {
    const waits: Promise<any>[] = [];
    const results: Record<string, any>[] = [];  
    COLS.forEach( col => {
        if ( ('sites' in col) ? col.sites.test(urls.getSite()) : true ) {
            if ( 'visibility' in col ) {
                const visible_promise: Promise<boolean> = col.visibility();
                waits.push(visible_promise);
                visible_promise.then( visible => {
                    if ( visible ) {
                        results.push( col );
                    }
                });
            } else {
                results.push( col );
            }
        }
    });
    return Promise.all(waits).then( _ => results );
}

function appendCell(
    tr: HTMLTableRowElement,
    order: azad_order.IOrder,
    col_spec: Record<string, any>,
): Promise<void> {
    const td = document.createElement('td')
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
    }
    const value_written_promise: Promise<void> =
        col_spec.hasOwnProperty('render_func') ?
            col_spec.render_func(order, td) :
            (() => {
                const value_promise: Promise<any> = <Promise<any>>(
                    order[<keyof azad_order.IOrder>(
                        col_spec.value_promise_func
                    )]()
                );
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
    if ('help' in col_spec) {
        td.setAttribute('class', td.getAttribute('class') + 'azad_elem_has_help ');
        td.setAttribute('title', col_spec.help);
    }
    order.id().then( id => {
        if (id == '203-4990948-9075513' && col_spec.field_name == 'postage') {
            value_written_promise.then(() => console.log('written promise resolved'));
        }
    })
    return value_written_promise;
}

function appendOrderRow(
    table: HTMLElement,
    order: azad_order.IOrder
): Promise<Promise<void>[]> {
    const tr = document.createElement('tr');
    table.appendChild(tr);
    return getCols().then( cols =>
        cols.map( col_spec => appendCell(tr, order, col_spec) )
    );
}

function addOrderTable(
    doc: HTMLDocument,
    orders: azad_order.IOrder[],
    wait_for_all_values_before_resolving: boolean
): Promise<HTMLTableElement> {
    const addHeader = function(row: HTMLElement, value: string, help: string) {
        const th = row.ownerDocument!.createElement('th');
        th.setAttribute('class', TH_CLASS);
        row.appendChild(th);
        th.textContent = value;
        if( help ) {
            th.setAttribute('class', th.getAttribute('class') + 'azad_th_has_help ');
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
    table.setAttribute('class', 'azad_table stripe compact hover order-column ');

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

    return getCols().then( cols => {
        cols.forEach( col_spec => {
            addHeader(hr, col_spec.field_name, col_spec.help);
            addHeader(fr, col_spec.field_name, col_spec.help);
        });

        const tbody = doc.createElement('tbody');
        table.appendChild(tbody);

        // Record all the promises: we're going to need to wait on all of them
        // to resolve before we can hand over the table to our callers.
        const row_done_promises = orders.map( order => {
            order.id().then( id => { order_map[id] = order; } );
            return appendOrderRow(tbody, order);
        });

        if (wait_for_all_values_before_resolving) {
            return Promise.all(row_done_promises).then( row_promises => {
                const value_done_promises: Promise<void>[] = [];
                row_promises.forEach(
                    cell_done_promises => value_done_promises.push(
                        ...cell_done_promises
                    )
                )
                console.log(
                    'value_done_promises.length',
                    value_done_promises.length
                );
                return Promise.all(value_done_promises).then( _ => table );
            });

        } else {
            return table;
        }
    });
}

function reallyDisplayOrders(
    orders: azad_order.IOrder[], beautiful: boolean,
    wait_for_all_values_before_resolving: boolean
): Promise<HTMLTableElement> {
    console.log('amazon_order_history_table.reallyDisplayOrders starting');
    for (let entry in order_map) {
        delete order_map[entry];
    }
    util.clearBody();
    const order_promises = orders.map(
        (order: azad_order.IOrder) => Promise.resolve(order)
    );
    const table_promise = addOrderTable(document, orders, wait_for_all_values_before_resolving);
    table_promise.then( _ => {
        if (beautiful) {
            $(document).ready( () => {
                if (datatable) {
                    datatable.destroy();
                }
                datatable = (<any>$('#azad_order_table')).DataTable({
                    'bPaginate': true,
                    'lengthMenu': [ [10, 25, 50, 100, -1],
                        [10, 25, 50, 100, 'All'] ],
                    'footerCallback': function() {
                        const api = this.api();
                        // Remove the formatting to get integer data for summation
                        const floatVal = (v: string | number): number => {
                            const parse = (i: string | number) => {
                                try {
                                    if(typeof i === 'string') {
                                        return (i === 'N/A' || i === '-' || i === 'pending') ?
                                            0 :
                                            parseFloat(
                                                i.replace(/^([£$]|CAD|EUR|GBP) */, '')
                                                 .replace(/,/, '.')
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
                        getCols().then( cols => cols.forEach( col_spec => {
                            if(col_spec.is_numeric) {
                                col_spec.sum = floatVal(
                                    api.column(col_index)
                                       .data()
                                       .map( (v: string | number) => floatVal(v) )
                                       .reduce( (a: number, b: number) => a + b, 0 )
                                );
                                col_spec.pageSum = floatVal(
                                    api.column(col_index, { page: 'current' })
                                       .data()
                                       .map( (v: string | number) => floatVal(v) )
                                       .reduce( (a: number, b: number) => a + b, 0 )
                                );
                                $(api.column(col_index).footer()).html(
                                    sprintf.sprintf('page=%s; all=%s',
                                        col_spec.pageSum.toFixed(2),
                                        col_spec.sum.toFixed(2))
                                );
                            }
                            col_index += 1;
                        }));
                    }
                });
                addProgressBar();
                util.removeButton('data table');
                util.addButton(
                    'plain table',
                    function() { displayOrders(order_promises, false, false); },
                    'azad_table_button'
                );
                addCsvButton(order_promises)
            });
        } else {
            addProgressBar();
            util.removeButton('plain table');
            util.addButton(
                'data table',
                function() { displayOrders(order_promises, true, false); },
                'azad_table_button'
            );
            addCsvButton(order_promises)
        }
    });

    console.log('azad.reallyDisplayOrders returning');
    return table_promise;
}

function addProgressBar(): void {
    progress_indicator = progress_bar.addProgressBar(document.body)
}

function addCsvButton(orders: Promise<azad_order.IOrder>[]): void {
    const title = "download spreadsheet ('.csv')";
    util.addButton(	
       title,
       function() {	
           displayOrders(orders, false, true).then(
               table => settings.getBoolean('show_totals_in_csv').then(
                   show_totals => csv.download(table, show_totals)
               )
           );
       },
       'azad_table_button'	
    );
}

// TODO: refactor so that order retrieval belongs to azad_table, but
// diagnostics building belongs to azad_order.
export function displayOrders(
    orderPromises: Promise<azad_order.IOrder>[],
    beautiful: boolean,
    wait_for_all_values_before_resolving: boolean
): Promise<HTMLTableElement> {
    console.log('amazon_order_history_table.displayOrders starting');
    return Promise.all(orderPromises).then( orders => {
        console.log('amazon_order_history_table.displayOrders then func starting');
        const table_promise: Promise<HTMLTableElement> = reallyDisplayOrders(
            orders, beautiful, wait_for_all_values_before_resolving
        );
        console.log(
            'amazon_order_history_table.displayOrders then func returning ' +
            'table promise.'
        );
        return table_promise;
    });
    console.log('amazon_order_history_table.displayOrders returning');
}

export function dumpOrderDiagnostics(order_id: string) {
    console.log('dumpOrderDiagnostics: ' + order_id);
    const order = order_map[order_id];
    if (order) {
        const utc_today = new Date().toISOString().substr(0,10);
        const file_name = order_id + '_' + utc_today + '.json';
        order.assembleDiagnostics()
            .then(
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

export function updateProgressBar(): void {
    if (progress_indicator) {
        const completed = stats.get('completed');
        const queued = stats.get('queued');
        const running = stats.get('running');
        if (completed!=null && queued!=null && running!=null) {
           const ratio: number = completed / (completed + queued + running);
           progress_indicator.update_progress(ratio);
        }
    }
}

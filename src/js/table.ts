/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

import * as $ from 'jquery';
import 'datatables';
import * as util from './util';
import * as csv from './csv';
import * as sprintf from 'sprintf-js';
import * as diagnostic_download from './diagnostic_download';
import * as azad_order from './order';

'use strict';

const CELL_CLASS = 'azad_cellClass ';
const ELEM_CLASS = 'azad_elemClass ';
const LINK_CLASS = 'azad_linkClass ';
const TH_CLASS = 'azad_thClass ';

let datatable: any = null;
const order_map: Record<string, azad_order.Order> = {};

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
const addElemCell = function(row: any, elem: any) {
    const td = row.ownerDocument.createElement('td');
    td.setAttribute('class', ELEM_CLASS);
    row.appendChild(td);
    td.appendChild(elem);
    return td;
};

/**
 * Add an a to the row tr element, and return the a.
 */
const addLinkCell = function(row: any, text: string, href: string) {
    const a = row.ownerDocument.createElement('a');
    a.setAttribute('Class', LINK_CLASS);
    a.textContent = text;
    a.href = href;
    return addElemCell(row, a);
};

const TAX_HELP = 'Caution: tax is often not listed when stuff is not supplied by Amazon, is cancelled, or is pre-order.';

const cols = [
    {
        field_name: 'order id',
        type: 'func',
        func: (order: azad_order.Order, row: any) => addLinkCell(
            row, order.id,
            order.detail_url
        ),
        is_numeric: false
    },
    {
        field_name: 'items',
        type: 'func',
        func: (order: azad_order.Order, row: any) => addElemCell(row, order.itemsHtml(document)),
        is_numeric: false
    },
    {
        field_name: 'to',
        type: 'promise',
        property_name: 'who',
        is_numeric: false
    },
    {
        field_name: 'date',
        type: 'promise',
        property_name: 'date',
        is_numeric: false,
    },
    {
        field_name: 'total',
        type: 'promise',
        property_name: 'total',
        is_numeric: true
    },
    {
        field_name: 'postage',
        type: 'promise',
        property_name: 'postage',
        is_numeric: true,
        help: 'If there are only N/A values in this column, your login session may have partially expired, meaning you (and the extension) cannot fetch order details. Try clicking on one of the order links in the left hand column and then retrying the extension button you clicked to get here.'
    },
    {
        field_name: 'gift',
        type: 'promise',
        property_name: 'gift',
        is_numeric: true
    },
    {
        field_name: 'VAT',
        type: 'promise',
        property_name: 'vat',
        is_numeric: true,
        help: TAX_HELP, 
        sites: new RegExp('amazon(?!.com)')
    },
    {
        field_name: 'tax',
        type: 'promise',
        property_name: 'us_tax',
        is_numeric: true,
        help: TAX_HELP,
        sites: new RegExp('\\.com$')
    },
    {
        field_name: 'GST',
        type: 'promise',
        property_name: 'gst',
        is_numeric: true,
        help: TAX_HELP,
        sites: new RegExp('\\.ca$')
    },
    {
        field_name: 'PST',
        type: 'promise',
        property_name: 'pst',
        is_numeric: true,
        help: TAX_HELP,
        sites: new RegExp('\\.ca$')
    },
    {
        field_name: 'refund',
        type: 'promise',
        property_name: 'refund',
        is_numeric: true
    },
    {
        field_name: 'payments',
        type: 'func',
        func: (order: azad_order.Order, tr: HTMLElement) => {
            const cell = addCell(tr, 'pending');
            order.getValuePromise('payments').then( payments => {
                const ul = document.createElement('ul');
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
                    a.setAttribute('href', util.getOrderPaymentUrl(order.id, util.getSite()));
                });
                cell.textContent = '';
                cell.appendChild(ul);
                if(datatable) {
                    datatable.rows().invalidate();
                    datatable.draw();
                }
            });
            return cell;
        },
        is_numeric: false
    }
].filter( col => ('sites' in col) ?
    col.sites.test(util.getSite()):
    true
);

function reallyDisplayOrders(orders: azad_order.Order[], beautiful: boolean) {
    console.log('amazon_order_history_table.reallyDisplayOrders starting');
    for (let entry in order_map) {
        delete order_map[entry];
    }

    // Record all the promises: we're going to need to wait on all of them to
    // resolve before we can hand over the table to our callers.
    const cell_value_promises: Promise<string>[] = [];

    const addOrderTable = function(orders: azad_order.Order[]) {
        const addHeader = function(row: HTMLElement, value: string, help: string) {
            const th = row.ownerDocument.createElement('th');
            th.setAttribute('class', TH_CLASS);
            row.appendChild(th);
            th.textContent = value;
            if( help ) {
                th.setAttribute('class', th.getAttribute('class') + 'azad_th_has_help ');
                th.setAttribute('title', help);
            }
            return th;
        };

        const appendOrderRow = function(
            table: HTMLElement,
            order: azad_order.Order
        ) {
            const tr = document.createElement('tr');
            table.appendChild(tr);
            cols.forEach( col_spec => {
                const null_converter = (x: any) => {
                    if (x) {
                        if (
                            typeof(x) === 'string' && 
                            parseFloat(x.replace(/^([£$]|CAD|EUR|GBP) */, '').replace(/,/, '.')) + 0 == 0) {
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
                let elem = null;
                switch(col_spec.type) {
                    // This seems to be only for when info is available already and no initial prep is needed.
                    // Seems like the item description could use this also.
                    case 'promise':
                        {
                            elem = addCell(tr, 'pending');
                            const elem_closure_copy = elem;
                            const value_promise = order.getValuePromise(col_spec.property_name);
                            cell_value_promises.push(value_promise);
                            value_promise
                                .then(null_converter)
                                .then(
                                    value => {
                                        elem_closure_copy.innerHTML = value;
                                        if(datatable) {
                                            datatable.rows().invalidate();
                                            datatable.draw();
                                        }
                                    }
                                );
                        }
                        break;
                    case 'func':
                        elem = col_spec.func(order, tr);
                        break;
                }
                if ( elem ) {
                    elem.setAttribute('class', elem.getAttribute('class') + 
                            'azad_type_' + col_spec.type + ' ' +
                            'azad_col_' + col_spec.property_name + ' ' + 
                            'azad_numeric_' + (col_spec.is_numeric ? 'yes' : 'no' ) + ' ');
                    if ('help' in col_spec) {
                        elem.setAttribute('class', elem.getAttribute('class') + 'azad_elem_has_help ');
                        elem.setAttribute('title', col_spec.help);
                    }
                }
            });
        };
        // remove any old table
        let table = document.querySelector('[id="azad_order_table"]');
        if ( table !== null ) {
            console.log('removing old table');
            table.parentNode.removeChild(table);
            console.log('removed old table');
        }
        console.log('adding table');
        table = document.createElement('table');
        console.log('added table');
        document.body.appendChild(table);
        table.setAttribute('id', 'azad_order_table');
        table.setAttribute('class', 'azad_table stripe compact hover order-column ');

        const thead = document.createElement('thead');
        thead.setAttribute('id', 'azad_order_table_head');
        table.appendChild(thead);

        const hr = document.createElement('tr');
        hr.setAttribute('id', 'azad_order_table_hr');
        thead.appendChild(hr);

        const tfoot = document.createElement('tfoot');
        tfoot.setAttribute('id', 'azad_order_table_foot');
        table.appendChild(tfoot);

        const fr = document.createElement('tr');
        fr.setAttribute('id', 'azad_order_table_fr');
        tfoot.appendChild(fr);

        cols.forEach( col_spec => {
            addHeader(hr, col_spec.field_name, col_spec.help);
            addHeader(fr, col_spec.field_name, col_spec.help);
        });

        const tbody = document.createElement('tbody');
        table.appendChild(tbody);

        orders.forEach( order => {
            order_map[order.id] = order;
            appendOrderRow(tbody, order);
            console.log('Added row for ' + order.id);
        });

        return table;
    };
    util.clearBody();
    const table = addOrderTable(orders);
    if(beautiful) {
        $(document).ready( () => {
            if (datatable) {
                datatable.destroy();
            }
            datatable = $('#azad_order_table').DataTable({
                'bPaginate': true,
                'lengthMenu': [ [10, 25, 50, 100, -1],
                    [10, 25, 50, 100, 'All'] ],
                'footerCallback': function() {
                    const api = this.api();
                    // Remove the formatting to get integer data for summation
                    const floatVal = v => {
                        const parse = i => {
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
                    cols.forEach( col_spec => {
                        if(col_spec.is_numeric) {
                            col_spec.sum = floatVal(
                                api.column(col_index)
                                   .data()
                                   .map( v => floatVal(v) )
                                   .reduce( (a, b) => a + b, 0 )
                            );
                            col_spec.pageSum = floatVal(
                                api.column(col_index, { page: 'current' })
                                   .data()
                                   .map( v => floatVal(v) )
                                   .reduce( (a, b) => a + b, 0 )
                            );
                            $(api.column(col_index).footer()).html(
                                sprintf.sprintf('page=%s; all=%s',
                                    col_spec.pageSum.toFixed(2),
                                    col_spec.sum.toFixed(2))
                            );
                        }
                        col_index += 1;
                    });
                }
            });
            util.removeButton('data table');
            util.addButton(
                'plain table',
                function() {
                    displayOrders(orders, false);
                },
                'azad_table_button'
            );
            addCsvButton(orders);
        });
    } else {
        util.removeButton('plain table');
        util.addButton(
            'data table',
            function() {
                displayOrders(orders, true);
            },
            'azad_table_button'
        );
        addCsvButton(orders);
    }
    console.log('azad.reallyDisplayOrders returning');

    // Don't let our callers get their hands on the table
    // until all of the cells have been populated.
    return Promise.all(cell_value_promises).then( () => table );
}

function addCsvButton(orders) {
    const title = 'download csv';
    util.removeButton(title);
    util.addButton(
        title,
        function() {
            displayOrders(orders, false).then(
                table => csv.download(table)
            );
        },
        'azad_table_button'
    );
}

// TODO: refactor so that order retrieval belongs to azad_table, but 
// diagnostics building belongs to azad_order.
export function displayOrders(orderPromises, beautiful) {
    console.log('amazon_order_history_table.displayOrders starting');
    return Promise.all(orderPromises).then( orders => {
        console.log('amazon_order_history_table.displayOrders then func starting');
        const return_val = reallyDisplayOrders(orders, beautiful);
        console.log('amazon_order_history_table.displayOrders then func returning');
        return return_val;
    });
}

export function dumpOrderDiagnostics(order_id) {
    console.log('dumpOrderDiagnostics: ' + order_id);
    const order = order_map[order_id];
    if (order) {
        const utc_today = new Date().toISOString().substr(0,10);
        order.assembleDiagnostics().then(
            diagnostics => diagnostic_download.save_json_to_file(
                diagnostics,
                order_id + '_' + utc_today + '.json'
            )
        );
    }
}

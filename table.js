/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* jshint strict: true, esversion: 6 */

const amazon_order_history_table = (function() {
    'use strict';
    const tableStyle = 'border: 1px solid black;';
    let datatable = null;

    /**
     * Add a td to the row tr element, and return the td.
     */
    const addCell = function(row, value) {
        const td = row.ownerDocument.createElement('td');
        td.setAttribute('style', tableStyle);
        row.appendChild(td);
        td.textContent = value;
        return td;
    };

    /**
     * Add a td to the row tr element, and return the td.
     */
    const addElemCell = function(row, elem) {
        const td = row.ownerDocument.createElement('td');
        td.setAttribute('style', tableStyle);
        row.appendChild(td);
        td.appendChild(elem);
        return td;
    };

    /**
     * Add a td to the row tr element, and return the td.
     */
    const addLinkCell = function(row, text, href) {
        const a = row.ownerDocument.createElement('a');
        a.textContent = text;
        a.href = href;
        return addElemCell(row, a);
    };

    const cols = [
        {
            field_name: 'order id',
            type: 'func',
            func: function(order, row){
                addLinkCell(
                    row, order.id,
                    amazon_order_history_util.getOrderDetailUrl(order.id)
                );
            },
            is_numeric: false,
        },
        {
            field_name: 'items',
            type: 'func',
            func: (order, row) => addElemCell(row, order.itemsHtml(document)),
            is_numeric: false,
        },
        {
            field_name: 'to',
            type: 'plain',
            property_name: 'who',
            is_numeric: false,
        },
        {
            field_name: 'date',
            type: 'plain',
            property_name: 'date',
            is_numeric: false,
        },
        {
            field_name: 'total',
            type: 'plain',
            property_name: 'total',
            is_numeric: true,
        },
        {
            field_name: 'postage',
            type: 'detail',
            property_name: 'postage',
            is_numeric: true,
            help: 'If there are only N/A values in this column, your login session may have partially expired, meaning you (and the extension) cannot fetch order details. Try clicking on one of the order links in the left hand column and then retrying the extension button you clicked to get here.',
        },
        {
            field_name: 'gift',
            type: 'detail',
            property_name: 'gift',
            is_numeric: true,
        },
        {
            // TODO: split this into VAT for EU countries and Tax for US
            // and get rid of the getSite logic that renames VAT to tax for US only.
            field_name: 'VAT',
            type: 'detail',
            property_name: 'vat',
            is_numeric: true,
            help: 'Caution: when stuff is not supplied by Amazon, then tax is often not listed.',
        },
        {
            field_name: 'GST',
            type: 'detail',
            property_name: 'gst',
            is_numeric: true,
            sites: ['www.amazon.ca', 'smile.amazon.ca'],
        },
        {
            field_name: 'PST',
            type: 'detail',
            property_name: 'pst',
            is_numeric: true,
            sites: ['www.amazon.ca', 'smile.amazon.ca'],
        },
        {
            field_name: 'refund',
            type: 'detail',
            property_name: 'refund',
            is_numeric: true,
        },
        {
            field_name: 'payments',
            type: 'payments',
            property_name: 'payments',
            is_numeric: false,
        },
    ].filter( col => ('sites' in col) ?
        amazon_order_history_util.getSite() in col.sites :
        true
    );

    function reallyDisplayOrders(orders, beautiful) {
        console.log('amazon_order_history_table.reallyDisplayOrders starting');
        const addOrderTable = function(orders) {
            const addHeader = function(row, value, help) {
                const th = row.ownerDocument.createElement('th');
                th.setAttribute('style', tableStyle);
                row.appendChild(th);
                th.textContent = value;
                if( help ) {
                    th.setAttribute('title', help);
                }
                return th;
            };

            const appendOrderRow = function(table, order) {
                const tr = document.createElement('tr');
                tr.setAttribute('style', tableStyle);
                table.appendChild(tr);
                cols.forEach( col_spec => {
                    let elem = null;
                    switch(col_spec.type) {
                        case 'plain':
                            elem = addCell(tr, order[col_spec.property_name]);
                            break;
                        case 'detail':
                            elem = addCell(tr, 'pending');
                            order.detail_promise.then( detail => {
                                elem.innerHTML = detail[col_spec.property_name];
                                if(datatable) {
                                    datatable.rows().invalidate();
                                    datatable.draw();
                                }
                            });
                            break;
                        case 'payments':
                            elem = addCell(tr, 'pending');
                            order.payments_promise.then( payments => {
                                const ul = document.createElement('ul');
                                payments.forEach( payment => {
                                    const li = document.createElement('li');
                                    ul.appendChild(li);
                                    const a = document.createElement('a');
                                    li.appendChild(a);
                                    a.textContent = payment + '; ';
                                    a.href = amazon_order_history_util.getOrderPaymentUrl(order.id);
                                });
                                elem.textContent = '';
                                elem.appendChild(ul);
                                if(datatable) {
                                    datatable.rows().invalidate();
                                    datatable.draw();
                                }
                            });
                            break;
                        case 'func':
                            col_spec.func(order, tr);
                            break;
                    }
                    if ('help' in col_spec) {
                        elem.setAttribute('title', col_spec.help);
                    }
                });
            };
            // remove any old table
            let table = document.querySelector('[id="order_table"]');
            if ( table !== null ) {
                console.log('removing old table');
                table.parentNode.removeChild(table);
                console.log('removed old table');
            }
            console.log('adding table');
            table = document.createElement('table');
            console.log('added table');
            document.body.appendChild(table);
            table.setAttribute('id', 'order_table');
            table.setAttribute('class', 'order_reporter_table stripe compact');
            table.setAttribute('style', tableStyle);

            const thead = document.createElement('thead');
            table.appendChild(thead);

            const hr = document.createElement('tr');
            thead.appendChild(hr);

            const tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);

            const fr = document.createElement('tr');
            tfoot.appendChild(fr);

            const is_us = amazon_order_history_util.getSite().endsWith('\.com');

            cols.forEach( col_spec => {
                const fieldName = col_spec.field_name;
                if (is_us && fieldName === 'vat') {
                    col_spec.field_name = 'tax';
                }
                if (is_us && fieldName === 'postage') {
                    col_spec.field_name = 'shipping';
                }
                addHeader(hr, col_spec.field_name, col_spec.help);
                addHeader(fr, col_spec.field_name, col_spec.help);
            });

            const tbody = document.createElement('tbody');
            table.appendChild(tbody);

            orders.forEach( order => {
                appendOrderRow(tbody, order);
                console.log('Added row for ' + order.id);
            });

            return table;
        };
        amazon_order_history_util.clearBody();
        const table = addOrderTable(orders);
        if(beautiful) {
            $(document).ready( () => {
                datatable = $('#order_table').DataTable({
                    'bPaginate': true,
                    'lengthMenu': [ [10, 25, 50, 100, -1],
                        [10, 25, 50, 100, 'All'] ],
                    'footerCallback': function(row, data, start, end, display) {
                        const api = this.api();
                        // Remove the formatting to get integer data for summation
                        const floatVal = function(i) {
                            if(typeof i === 'string') {
                                return (i === 'N/A' || i === '?') ?
                                    0 : parseFloat(i.replace(/^([£$]|CAD|EUR|GBP) */, '')
                                                    .replace(/,/, '.'));
                            }
                            if(typeof i === 'number') { return i; }
                            return 0;
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
                                    sprintf('page sum=%s; all=%s',
                                        col_spec.pageSum.toFixed(2),
                                        col_spec.sum.toFixed(2))
                                );
                            }
                            col_index += 1;
                        });
                    }
                });
                amazon_order_history_util.removeButton('data table');
                amazon_order_history_util.addButton(
                    'plain table',
                    function() {
                        console.log('amazon_order_history_table plain table button clicked');
                        displayOrders(orders, false);
                    },
                    'background-color:cornflowerblue; color:white'
                );
            });
        } else {
            amazon_order_history_util.removeButton('plain table');
            amazon_order_history_util.addButton(
                'data table',
                function() {
                    console.log('amazon_order_history_table data table button clicked');
                    displayOrders(orders, true);
                },
                'background-color:cornflowerblue; color:white'
            );
        }
        amazon_order_history_util.addButton(
            'download csv',
            function() {
                displayOrders(orders, false).then(
                    (table) => { amazon_order_history_csv.download(table); }
                );
            },
            'background-color:cornflowerblue; color:white'
        );
        console.log('amazon_order_history_table.reallyDisplayOrders returning');
        return table;
    }

    function displayOrders(orderPromises, beautiful) {
        console.log('amazon_order_history_table.displayOrders starting');
        return Promise.all(orderPromises).then( orders => {
            console.log('amazon_order_history_table.displayOrders then func starting');
            const return_val = reallyDisplayOrders(orders, beautiful);
            console.log('amazon_order_history_table.displayOrders then func returning');
            return return_val;
        });
    }

    return {displayOrders: displayOrders};
})();

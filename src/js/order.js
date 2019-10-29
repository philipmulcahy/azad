/* Copyright(c) 2019 Philip Mulcahy. */
/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */

// BUG: Sometimes, if  an order contains more than 4 items, only 4 are saved. See D01-1580288-1021057.
// There are two ways to fix this:
// 1. Update the item list from the order detail page or the invoice page.
// 2. Update from the Order search page.
// Ideally, probably want to do both.

/* jshint strict: true, esversion: 6 */

'use strict';

import util from './util';
import date from './date';
import extraction from './extraction';
import sprintf from 'sprintf-js';
import dom2json from './dom2json';

/**********************************************************************
 * getField is a wrapper which uses an xpath expression to identify and
 * extract webpage text from elem.
 *********************************************************************/
function getField(xpath, elem) {
    const valueElem = util.findSingleNodeValue(
        xpath, elem
    );
    try {
        return valueElem.textContent.trim();
    } catch (_) {
        return null;
    }
}

/**********************************************************************
 * Looks at entire order detail page.
 * extractDetailFromDoc is referenced by extractDetailPromise.
 *********************************************************************/
function extractDetailFromDoc(order, doc) {

    const who = function(){
        var x
        x = getField('.//div[contains(@class,"recipient")]' +
            '//span[@class="trigger-text"]', doc.documentElement);
        if ( !x ) {
            x = getField('.//div[contains(text(),"Recipient")]', doc.documentElement);
            if ( !x ) {
                x = getField('//table[contains(@class,"sample")]/tbody/tr/td/div/text()[2]', doc.documentElement);
                if ( !x ) {
                    x = getField('//li[contains(@class,"displayAddressFullName")]/text()', doc.documentElement);
                    if ( !x ) {
                        x = 'n/a';
                    }
                }
            }
        }
        return x;
    };

    const order_date = function(){
        return date.normalizeDateString(
            extraction.by_regex(
                [
                    '//*[contains(@class,"order-date-invoice-item")]/text()',
                    '//*[contains(@class, "orderSummary")]//*[contains(text(), "Digital Order: ")]/text()',
                ],
                /(?:Ordered on|Digital Order:) (.*)/i,
                order.date,
                doc.documentElement
            )
        );
    };

    const total = function(){

        // Example: 'Grand Total: $0.99' or 'Importe total: $16.20' or 'Total (VAT Included):	$ 71.97' or 'Total (I.V.A. Incluido):	$73.98'
        // Need to avoid: 'Item(s) Subtotal: $0.99' or 'Subtotal de artículo(s): $14.97' or 'Total Before Tax: $0.99'
        try {
            return extraction.by_regex(
                [
                    '//span[@class="a-color-price a-text-bold"]/text()',  //Scott 112-7790528-5248242

                    '//b[contains(text(),"Total for this Order")]/text()',  //Scott D01-0235439-4093031

                    '//div[contains(@id,"od-subtotals")]//' +
                    '*[   contains(text(),"Grand Total") ' +
                    'or   contains(text(),"Montant total TTC")' +
                    'or   contains(text(),"Total général du paiement")' +
                    ']/parent::div/following-sibling::div/span',

                    '//*[contains(text(),"Grand Total:") ' +               //(Summary, Invoice)Digital Kindle Payment grand total/.com/(en_US, es_US-->en) 
                    'or  contains(text(),"Total general:")' +              //(Summary, Invoice)Digital Kindle Payment grand total/.com/(es_US)
//                    'or  contains(text(),"Total (VAT Included):")' +       //(Summary, Invoice)Physical Payment grand total/.com/(es_US-->en)
//                    'or  contains(text(),"Total (I.V.A. Incluido):")' +    //(Summary, Invoice)Physical Payment grand total/.com/(es_US)
                    'or  contains(text(),"Total for this order:")' +
                    'or  contains(text(),"Total of this order:")' +        //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US-->en
                    'or  contains(text(),"Total de este pedido:")' +       //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US
                    'or  contains(text(),"Total del pedido:")' +           //(Summary, Invoice)Physical Order total/.com/es_US
                    'or  contains(text(),"Montant total TTC:")' +
                    'or  contains(text(),"Total général du paiement:")' +
                    ']',

                    '//*[contains(text(),"Grand Total:") ' +               //(Summary, Invoice)Digital Kindle Payment grand total/.com/(en_US, es_US-->en) 
                    'or  contains(text(),"Total general:")' +              //(Summary, Invoice)Digital Kindle Payment grand total/.com/(es_US)
//                    'or  contains(text(),"Total (VAT Included):")' +       //(Summary, Invoice)Physical Payment grand total/.com/(es_US-->en)
//                    'or  contains(text(),"Total (I.V.A. Incluido):")' +    //(Summary, Invoice)Physical Payment grand total/.com/(es_US)
                    'or  contains(text(),"Total for this order:")' +
                    'or  contains(text(),"Total of this order:")' +        //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US-->en
                    'or  contains(text(),"Total de este pedido:")' +       //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US
                    'or  contains(text(),"Order Total:")' +                //(Summary, Invoice)Physical Order total/.com/es_US-->en
                    'or  contains(text(),"Total del pedido:")' +           //(Summary, Invoice)Physical Order total/.com/es_US
                    'or  contains(text(),"Montant total TTC:")' +
                    'or  contains(text(),"Total général du paiement:")' +
                    ']/parent::*',
                ],
                null,
                'n/a',
                doc.documentElement
            ).replace(/.*: /, '').replace('-', '');
        } catch (_) {
            order.total = "Err1"
        }
    };

// BUG: Exclude gift wrap.
    const gift = function(){
        const a = extraction.by_regex(
            [
                '//div[contains(@id,"od-subtotals")]//' +
                'span[contains(text(),"Gift") or contains(text(),"Importo Buono Regalo")]/' +
                'parent::div/following-sibling::div/span',

                '//*[text()[contains(.,"Gift Certificate")]]',

                '//*[text()[contains(.,"Gift Card")]]',
            ],
            null,
            'n/a',
            doc.documentElement
        );
        if ( a ) {
            const b = a.match(
                /Gift (?:Certificate|Card) Amount: *([$£€0-9.]*)/);
            if( b !== null ) {
                return b[1];
            }
            if (/\d/.test(a)) {
                return a.replace('-', '');
            }
        }
        return 'N/A';
    };

    const postage = function() {
        return extraction.by_regex(
            [
                ['Postage', 'Shipping', 'Livraison', 'Delivery', 'Costi di spedizione'].map(
                    label => sprintf.sprintf(
                        '//div[contains(@id,"od-subtotals")]//' +
                        'span[contains(text(),"%s")]/' +
                        'parent::div/following-sibling::div/span',
                        label
                    )
                ).join('|')
            ],
            null,
            'N/A',
            doc.documentElement
        );
    };

    const vat = function() {
        if ( order.id == 'D01-9960417-3589456' ) {
            console.log('TODO - remove');
        }
        const a = extraction.by_regex(
            [
                ['VAT', 'tax', 'TVA', 'IVA'].map(
                    label => sprintf.sprintf(
                        '//div[contains(@id,"od-subtotals")]//' +
                        'span[contains(text(),"%s") ' +
                        'and not(contains(text(),"Before") or contains(text(), "esclusa") ' +
                        ')]/' +
                        'parent::div/following-sibling::div/span',
                        label
                    )
                ).join('|'),

                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                'span[contains(lower-case(text()),"vat")]/' +
                'parent::div/following-sibling::div/span',

                '//div[@id="digitalOrderSummaryContainer"]//*[lower-case(text())[contains(., "vat: ")]]',
            ],
            null,
            'n/a',
            doc.documentElement
        );
        if( a != null ) {
            const b = a.match(
                /VAT: *([-$£€0-9.]*)/i
            );
            if( b !== null ) {
                return b[1];
            }
        }
        return a;
    };

                // Example: 'Tax Collected: $0.77' or 'Impuestos cobrados: $1.23' or 'Taxes:	$ 0.00' or 'Impuestos:	$0.00'
                // Or: 'Estimated tax to be collected:	$0.00' or '
                // Need to avoid: 'Total Before Tax: $2.99' or 'Total antes de impuestos:	$71.97'

    const us_tax = function(){
        var a
        try {
            a = extraction.by_regex(
                [
                    './/tr[contains(td,"Tax Collected:")]',
                ],
                null,
                'n/a',
                doc.documentElement
                );
            a = a.match('Tax Collected:\\s+(((?:GBP|USD|CAD|EUR|AUD)?)\\s?(([$£€]?)\\s?(\\d+[.,]\\d\\d)))')[1];
        } catch (_) { 
            try {
                a = extraction.by_regex(
                    [
                        './/span[contains(text(),"Estimated tax to be collected:")]/../../div[2]/span'
                    ],
                    null,
                    'n/a',
                    doc.documentElement
                    );
                a = a.match('(((?:GBP|USD|CAD|EUR|AUD)?)\\s?(([$£€]?)\\s?(\\d+[.,]\\d\\d)))')[1];
            } catch (_) {
// No match for pre-orders because price and tax requirements subject to change.
                a = "n/a"
            }
        }

        return a;
    };

    const cad_gst = function() {
        const a = extraction.by_regex(
            [
                ['GST', 'HST'].map(
                    label => sprintf.sprintf(
                        '//div[contains(@id,"od-subtotals")]//' +
                        'span[contains(text(),"%s") and not(contains(.,"Before"))]/' +
                        'parent::div/following-sibling::div/span',
                        label
                    )
                ).join('|'),

                '//*[text()[contains(.,"GST") and not(contains(.,"Before"))]]',

                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                'span[contains(text(),"GST")]/' +
                'parent::div/following-sibling::div/span',
            ],
            /(:?VAT:)? *([-$£€0-9.]*)/i,
            "n/a",
            doc.documentElement
        );
        if (a) {
            return a;
        }
        return 'N/A';
    };

    const cad_pst = function(){
        const a = extraction.by_regex(
            [
                ['PST', 'RST', 'QST'].map(
                    label => sprintf.sprintf(
                        '//div[contains(@id,"od-subtotals")]//' +
                        'span[contains(text(),"%s") and not(contains(.,"Before"))]/' +
                        'parent::div/following-sibling::div/span',
                        label
                    )
                ).join('|'),

                '//*[text()[contains(.,"PST") and not(contains(.,"Before"))]]',

                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                'span[contains(text(),"PST")]/' +
                'parent::div/following-sibling::div/span',
            ],
            /(VAT: *)([-$£€0-9.]*)/i,
            "n/a",
            doc.documentElement
        );
        if (a) {
            return a;
        }
        return 'N/A';
    };

    const refund = function () {
        let a = getField(
            ['Refund'].map( //TODO other field names?
                label => sprintf.sprintf(
                    '//div[contains(@id,"od-subtotals")]//' +
                    'span[contains(text(),"%s")]/' +
                    'ancestor::div[1]/following-sibling::div/span',
                    label
                )
            ).join('|'),
            doc.documentElement
        );
        if ( a ) {
            return a;
        }
        return 'N/A';
    };

    return {
        date: order_date(),
        total: total(),
        postage: postage(),
        gift: gift(),
        us_tax: us_tax(),
        vat: vat(),
        gst: cad_gst(),
        pst: cad_pst(),
        refund: refund(),
        who: who(),
    };
}

/*********************************************************************/
const extractDetailPromise = (order, request_scheduler) => new Promise(
    resolve => {
// Looks at order detail page ??
// console.log("extractDetailPromise", order, request_scheduler);
        const query = util.getOrderDetailUrl(order.id);
        const event_converter = function(evt) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(
                evt.target.responseText, 'text/html'
            );
            return extractDetailFromDoc(order, doc);
        };
        request_scheduler.schedule(
            query,
            event_converter,
            order_details => {
                resolve(order_details);
            },
            order.id
        );
    }
);

class Order {
    constructor(ordersPageElem, request_scheduler, src_query) {
// Looks at order detail page.
        this.id = null;
        this.list_url = src_query;
        this.detail_url = null;
        this.invoice_url = null;
        this.date = null;
        this.total = null;
        this.who = null;
        this.detail_promise = null;
        this.items = null;
        this.request_scheduler = request_scheduler;
        this.extractOrder(ordersPageElem);
    }
    extractOrder(elem) {
/*********************************************************************
 * Here we pull info from the list.
 ********************************************************************/
// Looks at order detail page.

        const getItems = function(elem) {
// Looks at order detail page.

            /* *****************************************************************************************************
              <a class="a-link-normal" href="/gp/product/B01NAE8AW4/ref=oh_aui_d_detailpage_o01_?ie=UTF8&amp;psc=1">
                  The Rise and Fall of D.O.D.O.
              </a>

              or

              <a class="a-link-normal" href="/gp/product/B06X9BZNDM/ref=oh_aui_d_detailpage_o00_?ie=UTF8&amp;psc=1">
                  Provenance
              </a>

              but a-link-normal is more common than this, so we need to match on gp/product
              like this: .//div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]
              then we get:
                  name from contained text
                  link from href attribute
                  item: not sure what we use this for - will it still work?
            ***************************************************************************************************** */


            var itemResult

// Note, some items don't have title= links, and some don't have links which contain '/gp/product/'. See D01-9406277-3414619. Confirming "a-row" seems to be enough.
//                './/div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]',
            itemResult = util.findMultipleNodeValues(
                './/div[@class="a-row"]/a[@class="a-link-normal"]',
                elem);

            const items = {};
            itemResult.forEach(
                function(item){
                    const name = item.innerText.replace(/[\n\r]/g, " ")
                                             .replace(/  */g, " ")
                                             .trim();
                    const link = item.getAttribute('href');
                    items[name] = link;
                }
            );
            return items;
        };
        const doc = elem.ownerDocument;
        if(!doc) {
            console.warn('TODO - get rid of these');
        }

        this.date = date.normalizeDateString(
            getField(
                ['Commande effectuée', 'Order placed', 'Ordine effettuato', 'Pedido realizado'].map(
                    label => sprintf.sprintf(
                        './/div[contains(span,"%s")]' +
                        '/../div/span[contains(@class,"value")]',
                        label
                    )
                ).join('|'),
                elem
            )
        );
        // This field is no longer always available, particularly for .com
        // We replace it (where we know the search pattern for the country)
        // with information from the order detail page.
        this.total = getField('.//div[contains(span,"Total")]' +
            '/../div/span[contains(@class,"value")]', elem);

/**********************************************************************
 * Search for the order ID in elem. This fails in www.amazon.com and
 * smile.amazon.com, both English and Spanish.
 *********************************************************************/
/**********************************************************************
 * .map() and .sprintf() insert the values in the list (each assigned to
 * "label") into the long string. The resulting list of strings is then
 * concatenated into a single long string using .join().
 *********************************************************************/
// <div class="a-row">
        this.id = getField(
            ['Order #', 'commande', 'Ordine #', 'Pedido n.º', '&orderID=', '\\?orderID='].map(
                label => sprintf.sprintf(
                    './/div[contains(@class,"a-row")]' +
                    '[span[contains(@class,"label")]]' +
                    '[span[contains(@class,"value")]]' +
                    '[contains(span,"%s")]' +
                    '/span[contains(@class,"value")]',
                    label
                )
            ).join(' | '),
            elem
        );
        if (!this.id) {
/**********************************************************************
 * Brute force search for Order ID in elem
 *********************************************************************/
// this.id = util.findSingleNodeValue('//a[contains(@class, "a-button-text") and contains(@href, "orderID=")]/text()[normalize-space(.)="Order details"]/parent::*',elem);

            this.id = util.findSingleNodeValue('//a[contains(@class, "a-button-text") and contains(@href, "orderID=")]',elem).getAttribute('href').match(/.*orderID=([^?]*)/)[1].split(' ')[0].split('&')[0];

        }

        this.detail_url = util.getOrderDetailUrl(this.id);
        this.invoice_url = util.getOrderPaymentUrl(this.id);

        this.items = getItems(elem);
        this.detail_promise = extractDetailPromise(this, this.request_scheduler);
        this.payments_promise = new Promise(
            (resolve => {
                if (this.id.startsWith("D")) {
// Fix issue where this.result shows as "null"
                    resolve(( !this.total ? [this.date] : [this.date + ": " + this.total]));
                } else {
                    const event_converter = function(evt) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(
                            evt.target.responseText, 'text/html'
                        );
                        const payments = extraction.payments_from_invoice(doc);
                        // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
                        return payments;
                    }.bind(this);
                    this.request_scheduler.schedule(
                        this.invoice_url,
                        event_converter,
                        payments => {
                            resolve(payments);
                        },
                        this.id
                    );
                }
            }).bind(this)
        );
    }

    /**
     * Creates an html element suitable for embedding into a table cell
     * but doesn't actually embed it.
     * @param {document} doc. DOM document needed to create elements.
     */
    itemsHtml(doc) {
        const ul = doc.createElement('ul');
        for(let title in this.items) {
            if(this.items.hasOwnProperty(title)) {
                const li = doc.createElement('li');
                ul.appendChild(li);
                const a = doc.createElement('a');
                li.appendChild(a);
                a.textContent = title + '; ';
                a.href = this.items[title];
            }
        }
        return ul;
    }

    assembleDiagnostics() {
        const diagnostics = {};
        [
            'id',
            'list_url',
            'detail_url',
            'invoice_url',
            'date',
            'total',
            'who',
            'items'
        ].forEach(
            field_name => { diagnostics[field_name] = this[field_name]; }
        );
        return Promise.all([
            fetch(this.list_url)
                .then( response => response.text() )
                .then( text => { diagnostics.list_html = text; } ),
            fetch(this.detail_url)
                .then( response => response.text() )
                .then( text => { diagnostics.detail_html = text; } ),
            fetch(this.invoice_url)
                .then( response => response.text() )
                .then( text => { diagnostics.invoice_html = text; } )
        ]).then( () => diagnostics );
    }
}

function getOrdersForYearAndQueryTemplate(
    year,
    query_template,
    request_scheduler,
    nocache_top_level
) {
    let expected_order_count = null;
    let order_found_callback = null;
    let check_complete_callback = null;
    const order_promises = [];
    const sendGetOrderCount = function() {
        request_scheduler.schedule(
            generateQueryString(0),
            convertOrdersPage,
            receiveOrdersCount,
            '00000',
            nocache_top_level
        );
    };
    const generateQueryString = function(startOrderPos) {
        return sprintf.sprintf(
            query_template,
            {
                site: util.getSite(),
                year: year,
                startOrderPos: startOrderPos
            }
        );
    };
    const convertOrdersPage = function(evt) {
        const p = new DOMParser();
        const d = p.parseFromString(evt.target.responseText, 'text/html');
        const countSpan = util.findSingleNodeValue(
            './/span[@class="num-orders"]', d.documentElement);
        if ( !countSpan ) {
            console.warn(
                'Error: cannot find order count elem in: ' + evt.target.responseText
            );
        }
        expected_order_count = parseInt(
            countSpan.textContent.split(' ')[0], 10);
        console.log(
            'Expecting ' + expected_order_count + ' orders for ' + year
        );
        if(isNaN(expected_order_count)) {
            console.warn(
                'Error: cannot find order count in ' + countSpan.textContent
            );
        }
        /**************************************************************
         * Get the contents of the element with ID 'ordersContainer'.
         *************************************************************/
        let ordersElem;
        try {
            ordersElem = d.getElementById('ordersContainer');
        } catch(err) {
            console.warn(
                'Error: maybe you\'re not logged into ' +
                'https://' + util.getSite() + '/gp/css/order-history ' +
                err
            );
            return;
        }
        /**************************************************************
         * Split up orders into an array.
         *************************************************************/
        const order_elems = util.findMultipleNodeValues(
            './/*[contains(concat(" ", ' +
                'normalize-space(@class), ' +
                '" "), ' +
                '" order ")]',
            ordersElem
        );
        return {
            expected_order_count: expected_order_count,
            order_elems: order_elems.map( elem => dom2json.toJSON(elem) ),
        };
    };
    const receiveOrdersCount = function(orders_page_data) {
        expected_order_count = orders_page_data.expected_order_count;
        check_complete_callback();
        // TODO: restore efficiency - the first ten orders are visible in the page we got expected_order_count from.
        for(let iorder = 0; iorder < expected_order_count; iorder += 10) {
            console.log(
                'sending request for order: ' + iorder + ' onwards'
            );
            request_scheduler.schedule(
                generateQueryString(iorder),
                convertOrdersPage,
                receiveOrdersPageData,
                '2'
            );
        }
    };
    const receiveOrdersPageData = function(orders_page_data, src_query) {
console.log("receiveOrdersPageData", orders_page_data, src_query);
        const order_elems = orders_page_data.order_elems.map(
            elem => dom2json.toDOM(elem)
        );
        function makeOrderPromise(elem) {
            const order = create(elem, request_scheduler, src_query);
// Looks at order detail page.

            return Promise.resolve(order);
        }
        order_elems.forEach(
            elem => order_found_callback( makeOrderPromise(elem) )
        );
    };

    // Promise to array of Order Promise.
    return new Promise(
        resolve => {
            check_complete_callback = function() {
                console.log('check_complete_callback() actual:' + order_promises.length + ' expected:' + expected_order_count);
                if(order_promises.length === expected_order_count) {
                    console.log('resolving order_promises for ' + year);
                    resolve(order_promises);
                    console.log('resolved order_promises for ' + year);
                }
            };
            order_found_callback = function(order_promise) {
                order_promises.push(order_promise);
                order_promise.then( order => {
                    // TODO is "Fetching" the right message for this stage?
                    console.log('azad_order Fetching ' + order.id);
                });
                console.log(
                    'YearFetcher(' + year + ') order_promises.length:' +
                     order_promises.length +
                     ' expected_order_count:' +
                     expected_order_count
                );
                check_complete_callback();
            };
            sendGetOrderCount();
        }
    );
}

function fetchYear(year, request_scheduler, nocache_top_level) {
console.log("fetchYear", year, request_scheduler, nocache_top_level);
    const templates = {
        'smile.amazon.co.uk': ['https://%(site)s/gp/css/order-history' +
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
        'smile.amazon.de': ['https://%(site)s/gp/css/order-history' +
            '?opt=ab&digitalOrders=1' +
            '&unifiedOrders=1' +
            '&returnTo=' +
            '&orderFilter=year-%(year)s' +
            '&startIndex=%(startOrderPos)s' +
            '&language=en_GB'],
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
        'smile.amazon.ca': ['https://%(site)s/gp/css/order-history' +
            '?opt=ab&digitalOrders=1' +
            '&unifiedOrders=1' +
            '&returnTo=' +
            '&orderFilter=year-%(year)s' +
            '&startIndex=%(startOrderPos)s'],
        'www.amazon.ca': ['https://%(site)s/gp/css/order-history' +
            '?opt=ab&digitalOrders=1' +
            '&unifiedOrders=1' +
            '&returnTo=' +
            '&orderFilter=year-%(year)s' +
            '&startIndex=%(startOrderPos)s'],
        'smile.amazon.fr': ['https://%(site)s/gp/css/order-history' +
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
        'smile.amazon.com': ['https://%(site)s/gp/css/order-history' +
            '?opt=ab&digitalOrders=1' +
            '&unifiedOrders=1' +
            '&returnTo=' +
            '&orderFilter=year-%(year)s' +
            '&startIndex=%(startOrderPos)s'],
        'www.amazon.com': [
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
    }[util.getSite()];

    const promises_to_promises = templates.map(
        template => getOrdersForYearAndQueryTemplate(
            year,
            template,
            request_scheduler,
            nocache_top_level
        )
    );

    return Promise.all( promises_to_promises )
    .then( array2_of_promise => {
        const order_promises = [];
        array2_of_promise.forEach( promises => {
            promises.forEach( promise => {
                order_promises.push(promise);
            });
        });
        return order_promises;
    });
}

/* Returns array of Order Promise */
function getOrdersByYear(years, request_scheduler, latest_year) {
console.log("getOrdersByYear", years, request_scheduler, latest_year);
    // At return time we may not know how many orders there are, only
    // how many years in which orders have been queried for.
    return Promise.all(
        years.map(
            function(year) {
                const nocache_top_level = (year == latest_year);
                return fetchYear(year, request_scheduler, nocache_top_level);
            }
        )
    ).then(
        array2_of_order_promise => {
            // Flatten the array of arrays of Promise<Order> into
            // an array of Promise<Order>.
            return [].concat.apply(
                [],
                array2_of_order_promise
            );
        }
    );
}

function create(ordersPageElem, request_scheduler, src_query) {
    return new Order(ordersPageElem, request_scheduler, src_query);
}

export default {
    create: create,

    // Return Array of Order Promise.
    getOrdersByYear: getOrdersByYear,

    // For unit testing.
    extractDetailFromDoc: extractDetailFromDoc,
};

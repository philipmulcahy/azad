/* Copyright(c) 2016-2020 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

'use strict';

import util from './util';
import date from './date';
import extraction from './extraction';
import sprintf from 'sprintf-js';
import dom2json from './dom2json';

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

function extractDetailFromDoc(order, doc) {

    const who = function(){
        if(order.who) {
            return order.who;
        }
        const doc_elem = doc.documentElement;
        let x = getField(
            // TODO: this seems brittle, depending on the precise path of the element.
            '//table[contains(@class,"sample")]/tbody/tr/td/div/text()[2]',
            doc_elem
        ); // US Digital
        if ( !x ) {
            x = getField('.//div[contains(@class,"recipient")]' +
                '//span[@class="trigger-text"]', doc_elem);
            if ( !x ) {
                x = getField('.//div[contains(text(),"Recipient")]', doc_elem);
                if ( !x ) {
                    x = getField('//li[contains(@class,"displayAddressFullName")]/text()', doc_elem);
                    if ( !x ) {
                        x = 'null';
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
                    '//*[contains(@class,"order-date-invoice-item")]/text()', //20191025
                    '//*[contains(@class, "orderSummary")]//*[contains(text(), "Digital Order: ")]/text()', //20191025
                ],
                /(?:Ordered on|Digital Order:) (.*)/i, //20191025
                order.date,
                doc.documentElement
            )
        );
    };
// wrap in try/catch for missing total
    const total = function(){
        const a = extraction.by_regex(
            [
                '//span[@class="a-color-price a-text-bold"]/text()',    //Scott 112-7790528-5248242 en_US as of 20191024

                '//b[contains(text(),"Total for this Order")]/text()',  //Scott D01-0235439-4093031 en_US as of 20191025

                '//div[contains(@id,"od-subtotals")]//' +
                '*[contains(text(),"Grand Total") ' +
                'or contains(text(),"Montant total TTC")' +
                'or contains(text(),"Total général du paiement")' +
                ']/parent::div/following-sibling::div/span',           //20191025

                '//*[contains(text(),"Grand Total:") ' +               //(Summary, Invoice)Digital Kindle Payment grand total/.com/(en_US, es_US-->en) as of 20191015
                'or  contains(text(),"Total general:")' +              //(Summary, Invoice)Digital Kindle Payment grand total/.com/(es_US) as of 20191015
                'or  contains(text(),"Total for this order:")' +
                'or  contains(text(),"Total of this order:")' +        //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US-->en as of 20191015
                'or  contains(text(),"Total de este pedido:")' +       //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US as of 20191015
                'or  contains(text(),"Total del pedido:")' +           //(Summary, Invoice)Physical Order total/.com/es_US as of 20191015
                'or  contains(text(),"Montant total TTC:")' +
                'or  contains(text(),"Total général du paiement:")' +
                ']',

                '//*[contains(text(),"Grand Total:") ' +               //(Summary, Invoice)Digital Kindle Payment grand total/.com/(en_US, es_US-->en) as of 20191015
                'or  contains(text(),"Total general:")' +              //(Summary, Invoice)Digital Kindle Payment grand total/.com/(es_US) as of 20191015
                'or  contains(text(),"Total for this order:")' +
                'or  contains(text(),"Total of this order:")' +        //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US-->en as of 20191015
                'or  contains(text(),"Total de este pedido:")' +       //(Summary, Invoice)Digital Kindle Payment grand total/.com/es_US as of 20191015
                'or  contains(text(),"Order Total:")' +                //(Summary, Invoice)Physical Order total/.com/es_US-->en as of 20191015
                'or  contains(text(),"Total del pedido:")' +           //(Summary, Invoice)Physical Order total/.com/es_US as of 20191015
                'or  contains(text(),"Montant total TTC:")' +
                'or  contains(text(),"Total général du paiement:")' +
                ']/parent::*',
            ],
            null,
            order.total,
            doc.documentElement
        );
        if (a) {
            return a.replace(/.*: /, '').replace('-', '');
        }
        return a;
    };
// BUG: Need to exclude gift wrap
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
            null,
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
        return null;
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
                ).join('|') //20191025
            ],
            null,
            null,
            doc.documentElement
        );
    };
    const vat = function() {
        const xpaths = ['VAT', 'tax', 'TVA', 'IVA'].map(
            label =>
                '//div[contains(@id,"od-subtotals")]//' +
                'span[contains(text(), "' + label + '") ' +
                'and not(contains(text(),"Before") or contains(text(), "esclusa") ' +
                ')]/' +
                'parent::div/following-sibling::div/span'
        ).concat(
            [
                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                'span[contains(text(),"VAT")]/' +
                'parent::div/following-sibling::div/span',

                '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(., "VAT: ")]]'
            ]
        );
        const a = extraction.by_regex(
            xpaths,
            null,
            null,
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
    const us_tax = function(){
        let a = getField(
            '//span[contains(text(),"Estimated tax to be collected:")]/../../div[2]/span/text()',
            doc.documentElement
        );
        if ( !a ) {
            a = getField('.//tr[contains(td,"Tax Collected:")]', doc.documentElement);
            if (a) {
                const moneyRegEx = '\\s+(((?:GBP|USD|CAD|EUR|AUD)?)\\s?(([$£€]?)\\s?(\\d+[.,]\\d\\d)))'
                // Result
                // 0: "Tax Collected: USD $0.00"
                // 1: "USD $0.00"
                // 2:   "USD"
                // 3:   "$0.00"
                // 4:     "$"
                // 5:     "0.00"
                a = a.match(moneyRegEx)[1];
            } else {
                a = null;
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
            null,
            doc.documentElement
        );
        if (a) {
            return a;
        }
        return null;
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
            null,
            doc.documentElement
        );
        if (a) {
            return a;
        }
        return null;
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
        return null;
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

const extractDetailPromise = (order, request_scheduler) => new Promise(
    resolve => {
        const query = order.detail_url;
        const event_converter = function(evt) {
            const doc = util.parseStringToDOM( evt.target.responseText );
            return extractDetailFromDoc(order, doc);
        };
        try {
            request_scheduler.schedule(
                query,
                event_converter,
                order_details => {
                    resolve(order_details);
                },
                order.id
            );
        } catch (ex) {
            console.error('scheduler rejected ' + order.id + ' ' + query);
        }
    }
);

class Order {
    constructor(ordersPageElem, request_scheduler, src_query) {
        this.id = null;
        this.site = null;
        this.list_url = src_query;
        this.detail_url = null;
        this.invoice_url = null;
        this.date = null;
        this.total = null;
        this.who = null;
        this.detail_promise = null;
        this.items = null;
        this.request_scheduler = request_scheduler;
        this._extractOrder(ordersPageElem);
    }

    getValuePromise(key) {
        const detail_keys = [
            'date',
            'gift',
            'gst',
            'postage',
            'pst',
            'refund',
            'total',
            'us_tax',
            'vat',
            'who',
        ];
        if (detail_keys.includes(key)) {
            return this.detail_promise.then(
                detail => detail[key]
            );
        }
        if (key == 'payments') {
            return this.payments_promise;
        }
        return Promise.resolve(this[key]);
    }

    _extractOrder(elem) {
        const getItems = function(elem) {
            /*
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
            */
            const itemResult = util.findMultipleNodeValues(
// Note, some items don't have title= links, and some don't have links which contain '/gp/product/'. See D01-9406277-3414619. Confirming "a-row" seems to be enough.
//                './/div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]',
                './/div[@class="a-row"]/a[@class="a-link-normal"]',
                elem
            );
            const items = {};
            itemResult.forEach(
                function(item){
                    const name = item.innerHTML.replace(/[\n\r]/g, " ")
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
        this.who = getField('.//div[contains(@class,"recipient")]' +
            '//span[@class="trigger-text"]', elem);
        this.id = Array(...elem.getElementsByTagName('a'))
            .filter( el => el.hasAttribute('href') )
            .map( el => el.getAttribute('href') )
            .map( href => href.match(/.*orderID=([A-Z0-9-]*).*/) )
            .filter( match => match )[0][1];
        this.site = this.list_url.match(/.*\/\/([^/]*)/)[1];
        this.detail_url = util.getOrderDetailUrl(this.id, this.site);
        this.invoice_url = util.getOrderPaymentUrl(this.id, this.site);
        if (!this.id) {
            this.id = util.findSingleNodeValue(
                '//a[contains(@class, "a-button-text") and contains(@href, "orderID=")]/text()[normalize-space(.)="Order details"]/parent::*',
                elem
            ).getAttribute('href').match(/.*orderID=([^?]*)/)[1];
        }
        this.items = getItems(elem);
        this.detail_promise = extractDetailPromise(this, this.request_scheduler);
        this.payments_promise = new Promise(
            (resolve => {
                if (this.id.startsWith("D")) {
                    resolve(( !this.total ? [this.date] : [this.date + ": " + this.total]));
                } else {
                    const event_converter = function(evt) {
                        const doc = util.parseStringToDOM( evt.target.responseText );
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
            if (Object.prototype.hasOwnProperty.call(this.items, title)) {
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
        const d = util.parseStringToDOM(evt.target.responseText);
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
            console.warn(
                'Error: maybe you\'re not logged into ' +
                'https://' + util.getSite() + '/gp/css/order-history ' +
                err
            );
            return;
        }
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
        const order_elems = orders_page_data.order_elems.map(
            elem => dom2json.toDOM(elem)
        );
        function makeOrderPromise(elem) {
            const order = create(elem, request_scheduler, src_query);
            return Promise.resolve(order);
        }
        order_elems.forEach(
            elem => order_found_callback( makeOrderPromise(elem) )
        );
    };

    // Promise to array of Order Promise.
    return new Promise(
        resolve => {
            {
                let scheduled_check_id = null;
                const checkComplete = function() {
                    clearTimeout(scheduled_check_id);
                    console.log(
                        'checkComplete() actual:' + order_promises.length
                        + ' expected:' + expected_order_count
                    );
                    if(order_promises.length == expected_order_count ||
                        !request_scheduler.isLive()
                    ) {
                        console.log('resolving order_promises for ' + year);
                        resolve(order_promises);
                        console.log('resolved order_promises for ' + year);
                    } else {
                        scheduled_check_id = setTimeout(
                            checkComplete,
                            1000
                        );
                    }
                };
                // start checking loop
                checkComplete();
            }
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
            };
            sendGetOrderCount();
        }
    );
}

function fetchYear(year, request_scheduler, nocache_top_level) {
    const templates_by_site = {
/*        'smile.amazon.co.uk': ['https://%(site)s/gp/css/order-history' +
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
*/        'other': ['https://%(site)s/gp/css/order-history' +
            '?opt=ab&digitalOrders=1' +
            '&unifiedOrders=1' +
            '&returnTo=' +
            '&orderFilter=year-%(year)s' +
            '&startIndex=%(startOrderPos)s'],
    }

//    const templates = templates_by_site[util.getSite()];
    const templates = templates_by_site['other'];

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
        // We can now know how many orders there are, although we may only
        // have a promise to each order not the order itself.
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

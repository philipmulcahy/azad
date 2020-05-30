/* Copyright(c) 2017-2020 Philip Mulcahy. */

'use strict';

import * as util from './util';
import * as date from './date';
import * as extraction from './extraction';
import * as sprintf from 'sprintf-js';
import * as dom2json from './dom2json';
import * as request_scheduler from './request_scheduler';

function getField(xpath: string, elem: HTMLElement) {
    const valueElem = util.findSingleNodeValue(
        xpath, elem
    );
    try {
        return valueElem.textContent.trim();
    } catch (_) {
        return null;
    }
}

function extractDetailFromDoc(order: OrderImpl, doc: HTMLDocument) {

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

interface IOrderDetails {
    date: string;
    total: string;
    postage: string;
    gift: string;
    us_tax: string;
    vat: string;
    gst: string;
    pst: string;
    refund: string;
    who: string;

    [index: string]: string;
}

const extractDetailPromise = (
    order: OrderImpl,
    scheduler: request_scheduler.IRequestScheduler
) => new Promise<IOrderDetails>(
    resolve => {
        const query = order.detail_url;
        const event_converter = function(
            evt: { target: { responseText: string; }; }
        ): IOrderDetails {
            const doc = util.parseStringToDOM( evt.target.responseText );
            return extractDetailFromDoc(order, doc);
        };
        try {
            scheduler.schedule(
                query,
                event_converter,
                (order_details: IOrderDetails) => {
                    resolve(order_details);
                },
                order.id,
                false
            );
        } catch (ex) {
            console.error('scheduler rejected ' + order.id + ' ' + query);
        }
    }
);

export interface IOrder {
    id(): Promise<string>;
    detail_url(): Promise<string>;

    site(): Promise<string>;
    date(): Promise<string>;
    total(): Promise<string>;
    who(): Promise<string>;
    items(): Promise<Record<string, any>>;
    payments(): Promise<any>;
    date():  Promise<string>;
    total(): Promise<string>;
    postage(): Promise<string>;
    gift(): Promise<string>;
    us_tax(): Promise<string>;
    vat(): Promise<string>;
    gst(): Promise<string>;
    pst(): Promise<string>;
    refund(): Promise<string>;
    who(): Promise<string>;

    assembleDiagnostics(): Promise<Record<string,any>>;
}

class Order {
    impl: OrderImpl;

    constructor(impl: OrderImpl) {
        this.impl = impl
    }

    id(): Promise<string> { return Promise.resolve(this.impl.id); }
    detail_url(): Promise<string> { return Promise.resolve(this.impl.detail_url); }

    site(): Promise<string> { return Promise.resolve(this.impl.site); }
    date(): Promise<string> { return Promise.resolve(this.impl.date); }
    total(): Promise<string> { return Promise.resolve(this.impl.total); }
    who(): Promise<string> { return Promise.resolve(this.impl.who); }
    items(): Promise<Record<string, any>> { return Promise.resolve(this.impl.items); }
    payments(): Promise<any> { return this.impl.payments_promise; }

    postage(): Promise<string> { return this.impl.detail_promise.then( detail => detail.postage ) }
    gift(): Promise<string> { return this.impl.detail_promise.then( detail => detail.gift ) };
    us_tax(): Promise<string> { return this.impl.detail_promise.then( detail => detail.us_tax ) }
    vat(): Promise<string> { return this.impl.detail_promise.then( detail => detail.vat ) }
    gst(): Promise<string> { return this.impl.detail_promise.then( detail => detail.gst ) }
    pst(): Promise<string> { return this.impl.detail_promise.then( detail => detail.pst ) }
    refund(): Promise<string> { return this.impl.detail_promise.then( detail => detail.refund ) }

    assembleDiagnostics(): Promise<Record<string,any>> { return this.impl.assembleDiagnostics(); }
}

class OrderImpl {
    id: string;
    site: string;
    list_url: string;
    detail_url: string;
    invoice_url: string;
    date: string;
    total: string;
    who: string;
    detail_promise: Promise<IOrderDetails>;
    items: Record<string, any>;
    payments_promise: Promise<any>;
    scheduler: request_scheduler.IRequestScheduler;

    constructor(
        ordersPageElem: HTMLElement,
        scheduler: request_scheduler.IRequestScheduler,
        src_query: string
    ) {
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
        this.scheduler = scheduler;
        this._extractOrder(ordersPageElem);
    }
    _extractOrder(elem: HTMLElement) {
        const getItems = function(elem: HTMLElement): Record<string, any> {
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
            const itemResult: Node[] = util.findMultipleNodeValues(
// Note, some items don't have title= links, and some don't have links which contain '/gp/product/'. See D01-9406277-3414619. Confirming "a-row" seems to be enough.
//                './/div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]',
                './/div[@class="a-row"]/a[@class="a-link-normal"]',
                elem
            );
            const items: Record<string, any> = {};
            itemResult.forEach(
                function(item: HTMLElement) {
                    const name = item.innerHTML
                                     .replace(/[\n\r]/g, " ")
                                     .replace(/  */g, " ")
                                     .replace(/&amp;/g, "&")
                                     .replace(/&nbsp;/g, " ")
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
        console.log('total direct:', this.total);
        this.who = getField('.//div[contains(@class,"recipient")]' +
            '//span[@class="trigger-text"]', elem);
        this.id = [
            ...Array.prototype.slice.call(elem.getElementsByTagName('a'))]
            .filter( el => el.hasAttribute('href') )
            .map( el => el.getAttribute('href') )
            .map( href => href.match(/.*orderID=([A-Z0-9-]*).*/) )
            .filter( match => match )[0][1];
        this.site = this.list_url.match(/.*\/\/([^/]*)/)[1];
        this.detail_url = util.getOrderDetailUrl(this.id, this.site);
        this.invoice_url = util.getOrderPaymentUrl(this.id, this.site);
        if (!this.id) {
            const id_node: Node = util.findSingleNodeValue(
                '//a[contains(@class, "a-button-text") and contains(@href, "orderID=")]/text()[normalize-space(.)="Order details"]/parent::*',
                elem
            );
            const id_elem: HTMLElement = <HTMLElement>id_node;
            const more_than_id: string = id_elem.getAttribute('href');
            this.id = more_than_id.match(/.*orderID=([^?]*)/)[1];
        }
        this.items = getItems(elem);
        this.detail_promise = extractDetailPromise(this, this.scheduler);
        this.payments_promise = new Promise(
            ((resolve: (payments: string[]) => void) => {
                if (this.id.startsWith("D")) {
                    resolve(( !this.total ? [this.date] : [this.date + ": " + this.total]));
                } else {
                    const event_converter = function(evt: any) {
                        const doc = util.parseStringToDOM( evt.target.responseText );
                        const payments = extraction.payments_from_invoice(doc);
                        // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
                        return payments;
                    }.bind(this);
                    this.scheduler.schedule(
                        this.invoice_url,
                        event_converter,
                        payments => { resolve(payments); },
                        this.id,  // priority
                        false  // nocache
                    );
                }
            }).bind(this)
        );
    }

    assembleDiagnostics(): Promise<Record<string,any>> {
        const diagnostics: Record<string, any> = {};
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
            (function(field_name: keyof Order) {
                const value: any = this[field_name];
                diagnostics[<string>(field_name)] = value;
            }).bind(this)
        );
        return Promise.all([
            fetch(this.list_url)
                .then( response => response.text() )
                .then( text => { diagnostics['list_html'] = text; } ),
            fetch(this.detail_url)
                .then( response => response.text() )
                .then( text => { diagnostics['detail_html'] = text; } ),
            fetch(this.invoice_url)
                .then( response => response.text() )
                .then( text => { diagnostics['invoice_html'] = text; } )
        ]).then( () => diagnostics );
    }
}

interface IOrdersPageData {
    expected_order_count: number;
    order_elems: dom2json.IJsonObject;
}

function getOrdersForYearAndQueryTemplate(
    year: number,
    query_template: string,
    scheduler: request_scheduler.IRequestScheduler,
    nocache_top_level: boolean
) {
    let expected_order_count: number = null;
    let order_found_callback: (order_promise: Promise<IOrder>) => void = null;
    const order_promises: Promise<IOrder>[] = [];
    const sendGetOrderCount = function() {
        scheduler.schedule(
            generateQueryString(0),
            convertOrdersPage,
            receiveOrdersCount,
            '00000',
            nocache_top_level
        );
    };
    const generateQueryString = function(startOrderPos: number) {
        return sprintf.sprintf(
            query_template,
            {
                site: util.getSite(),
                year: year,
                startOrderPos: startOrderPos
            }
        );
    };
    const convertOrdersPage = function(evt: any): IOrdersPageData {
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
        const order_elems: HTMLElement[] = util.findMultipleNodeValues(
            './/*[contains(concat(" ", normalize-space(@class), " "), " order ")]',
            ordersElem
        ).map( node => <HTMLElement>node );
        console.log('order_elems:', order_elems.map(oe => oe.innerHTML));
        return {
            expected_order_count: expected_order_count,
            order_elems: order_elems.map( elem => dom2json.toJSON(elem) ),
        };
    };
    const receiveOrdersCount = function(orders_page_data: { expected_order_count: number; }) {
        expected_order_count = orders_page_data.expected_order_count;
        // TODO: restore efficiency - the first ten orders are visible in the page we got expected_order_count from.
        for(let iorder = 0; iorder < expected_order_count; iorder += 10) {
            console.log(
                'sending request for order: ' + iorder + ' onwards'
            );
            scheduler.schedule(
                generateQueryString(iorder),
                convertOrdersPage,
                receiveOrdersPageData,
                '2',
                false
            );
        }
    };
    const receiveOrdersPageData = function(orders_page_data: any, src_query: string): void {
        const order_elems = orders_page_data.order_elems.map(
            (elem: any) => dom2json.toDOM(elem)
        );
        function makeOrderPromise(elem: HTMLElement): Promise<IOrder> {
            const order = create(elem, scheduler, src_query);
            return Promise.resolve(order);
        }
        order_elems.forEach(
            (elem: HTMLElement) => order_found_callback( makeOrderPromise(elem) )
        );
    };

    // Promise to array of Order Promise.
    return new Promise(
        resolve => {
            {
                let scheduled_check_id: NodeJS.Timeout = null;
                const checkComplete = function() {
                    clearTimeout(scheduled_check_id);
                    console.log(
                        'checkComplete() actual:' + order_promises.length
                        + ' expected:' + expected_order_count
                    );
                    if(order_promises.length == expected_order_count ||
                        !scheduler.isLive()
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
            order_found_callback = function(order_promise: Promise<IOrder>): void {
                order_promises.push(order_promise);
                order_promise.then(
                    order => order.id().then(
                        id => console.log('azad_order Fetching ' + id)
                    )
                )
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

function fetchYear(
    year: number,
    scheduler: request_scheduler.IRequestScheduler,
    nocache_top_level: boolean
): Promise<Promise<IOrder>[]> {
    const templates_by_site: Record<string, string[]> = {
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
        'smile.amazon.com': [
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
    let templates = templates_by_site[util.getSite()];
    if ( !templates ) {
        templates = templates_by_site['other'];
        alert('Amazon Order History Reporter Chrome Extension\n\n' +
              'Your site is not fully supported.\n' +
              'For better support, click on the popup where it says\n' +
              '"CLICK HERE if you get incorrect results!",\n' +
              'and provide the diagnostic information');
    }

    const promises_to_promises: Array<Promise<any>> = templates.map(
        template => getOrdersForYearAndQueryTemplate(
            year,
            template,
            scheduler,
            nocache_top_level
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
    latest_year: number
): Promise<Promise<IOrder>[]> {
    // At return time we may not know how many orders there are, only
    // how many years in which orders have been queried for.
    return Promise.all(
        years.map(
            function(year: number): Promise<Promise<IOrder>[]> {
                const nocache_top_level = (year == latest_year);
                return fetchYear(year, scheduler, nocache_top_level);
            }
        )
    ).then(
        (array2_of_order_promise: Promise<IOrder>[][]) => {
            // Flatten the array of arrays of Promise<Order> into
            // an array of Promise<Order>.
            const order_promises: Promise<IOrder>[] = [];
            array2_of_order_promise.forEach(
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

export function create(
    ordersPageElem: HTMLElement,
    scheduler: request_scheduler.IRequestScheduler,
    src_query: string
): IOrder {
    const impl = new OrderImpl(ordersPageElem, scheduler, src_query);
    const wrapper = new Order(impl);
    return wrapper;
}

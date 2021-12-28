/* Copyright(c) 2017-2021 Philip Mulcahy. */

'use strict';

import * as date from './date';
import * as azad_entity from './entity';
import * as notice from './notice';
import * as extraction from './extraction';
import * as signin from './signin';
import * as sprintf from 'sprintf-js';
import * as dom2json from './dom2json';
import * as request_scheduler from './request_scheduler';
import * as urls from './url';
import * as util from './util';
import * as item from './item';

function getField(
    xpath: string,
    elem: HTMLElement,
    context: string
): string|null {
    try {
        const valueElem = util.findSingleNodeValue(xpath, elem, context);
        return valueElem!.textContent!.trim();
    } catch (_) {
        return null;
    }
}

function getAttribute(
    xpath: string,
    attribute_name: string,
    elem: HTMLElement,
    context: string,
): string|null {
    try {
        const targetElem = util.findSingleNodeValue(xpath, elem, context);
        return (<HTMLElement>targetElem)!.getAttribute(attribute_name);
    } catch (_) {
        return null;
    }
}

function getCachedAttributeNames() {
    return new Set<string>(['class', 'href', 'id', 'style']);
}

function getCacheExcludedElementTypes() {
    return new Set<string>(['img']);
}

interface IOrderDetails {
    date: string;
    total: string;
    postage: string;
    postage_refund: string;
    gift: string;
    us_tax: string;
    vat: string;
    gst: string;
    pst: string;
    refund: string;
    who: string;
    invoice_url: string;

    [index: string]: string;
};

function extractDetailFromDoc(
    order: OrderImpl, doc: HTMLDocument
): IOrderDetails {
    const context = 'id:' + order.id;
    const who = function(){
        if(order.who) {
            return order.who;
        }
        const doc_elem = doc.documentElement;
        let x = getField(
            // TODO: this seems brittle, depending on the precise path of the element.
            '//table[contains(@class,"sample")]/tbody/tr/td/div/text()[2]',
            doc_elem,
            context
        ); // US Digital
        if ( !x ) {
            x = getField('.//div[contains(@class,"recipient")]' +
                '//span[@class="trigger-text"]', doc_elem, context);
            if ( !x ) {
                x = getField(
                    './/div[contains(text(),"Recipient")]',
                    doc_elem,
                    context
                );
                if ( !x ) {
                    x = getField(
                        '//li[contains(@class,"displayAddressFullName")]/text()',
                        doc_elem,
                        context,
                    );
                    if ( !x ) {
                        x = 'null';
                    }
                }
            }
        }
        return x;
    };

    const order_date = function(): string {
        const d = extraction.by_regex(
            [
                '//*[contains(@class,"order-date-invoice-item")]/text()',
                '//*[contains(@class, "orderSummary")]//*[contains(text(), "Digital Order: ")]/text()',
            ],
            /(?:Ordered on|Commandé le|Digital Order:) (.*)/i,
            order.date,
            doc.documentElement,
            context,
        );
        if (d) {
            return date.normalizeDateString(d);
        }
        return util.defaulted(order.date, '');
    };

    const total = function(): string {
        const a = extraction.by_regex(
            [
                '//span[@class="a-color-price a-text-bold"]/text()',

                '//b[contains(text(),"Total for this Order")]/text()',

                '//span[contains(@id,"grand-total-amount")]/text()',

                '//div[contains(@id,"od-subtotals")]//' +
                '*[contains(text(),"Grand Total") ' +
                'or contains(text(),"Montant total TTC")' +
                'or contains(text(),"Total général du paiement")' +
                ']/parent::div/following-sibling::div/span',

                '//span[contains(text(),"Grand Total:")]' +
                '/parent::*/parent::*/div/span[' +
                'contains(text(), "$") or ' +
                'contains(text(), "£") or ' +
                'contains(text(), "€") or ' +
                'contains(text(), "AUD") or ' +
                'contains(text(), "CAD") or ' +
                'contains(text(), "GBP") or ' +
                'contains(text(), "USD") ' +
                ']/parent::*/parent::*',

                '//*[contains(text(),"Grand total:") ' +
                'or  contains(text(),"Grand Total:") ' +
                'or  contains(text(),"Total general:")' +
                'or  contains(text(),"Total for this order:")' +
                'or  contains(text(),"Total of this order:")' +
                'or  contains(text(),"Total de este pedido:")' +
                'or  contains(text(),"Total del pedido:")' +
                'or  contains(text(),"Montant total TTC:")' +
                'or  contains(text(),"Total général du paiement:")' +
                ']',

            ],
            null,
            order.total,
            doc.documentElement,
            context,
        );
        if (a) {
            const whitespace = /[\n\t ]/g;
            return a.replace(/^.*:/, '')
                    .replace(/[\n\t ]/g, '')  // whitespace
                    .replace('-', '');
        }
        return util.defaulted(a, '');
    };
    
    // TODO Need to exclude gift wrap
    const gift = function(): string {
        const a = extraction.by_regex(
            [
                '//div[contains(@id,"od-subtotals")]//' +
                'span[contains(text(),"Gift") or contains(text(),"Importo Buono Regalo")]/' +
                'parent::div/following-sibling::div/span',

                '//span[contains(@id, "giftCardAmount-amount")]/text()', // Whole foods or Amazon Fresh.

                '//*[text()[contains(.,"Gift Certificate")]]',

                '//*[text()[contains(.,"Gift Card")]]',
            ],
            null,
            null,
            doc.documentElement,
            context,
        );
        if ( a ) {
            const b = a.match(
                /Gift (?:Certificate|Card) Amount: *-?([$£€0-9.]*)/i);
            if( b !== null ) {
                return b[1];
            }
            if (/\d/.test(a)) {
                return a.replace('-', '');
            }
        }
        return '';
    };

    const postage = function(): string {
        return util.defaulted(
            extraction.by_regex(
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
                doc.documentElement,
                context,
            ),
            ''
        );
    };

    const postage_refund = function(): string {
        return util.defaulted(
            extraction.by_regex(
                [
                    ['FREE Shipping'].map(
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
                doc.documentElement,
                context,
            ),
            ''
        );
    };

    const vat = function(): string {
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

                '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(., "VAT: ")]]',
                '//div[contains(@class, "orderSummary")]//*[text()[contains(., "VAT: ")]]'
            ]
        );
        const a = extraction.by_regex(
            xpaths,
            null,
            null,
            doc.documentElement,
            context,
        );
        if( a != null ) {
            const b = a.match(
                /VAT: *([-$£€0-9.]*)/i
            );
            if( b !== null ) {
                return b[1];
            }
        }
        return util.defaulted(a, '');
    };

    const us_tax = function(): string {
        let a = extraction.by_regex(
            [
                '//span[contains(text(),"Estimated tax to be collected:")]/../../div[2]/span/text()',
                '//span[contains(@id, "totalTax-amount")]/text()',
            ],
            util.moneyRegEx(),
            null,
            doc.documentElement,
            context,
        );
        if ( !a ) {
            a = getField(
                './/tr[contains(td,"Tax Collected:")]',
                doc.documentElement,
                context,
            );
            if (a) {
                // Result
                // 0: "Tax Collected: USD $0.00"
                // 1: "USD $0.00"
                // 2:   "USD"
                // 3:   "$0.00"
                // 4:     "$"
                // 5:     "0.00"
                try {
                    // @ts-ignore stop complaining: you're in a try block!
                    a = a.match(util.moneyRegEx())[1];
                } catch {
                    a = null;
                }
            } else {
                a = null;
            }
        }
        return util.defaulted(a, '');
    };

    const cad_gst = function(): string {
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
            doc.documentElement,
            context,
        );
        return util.defaulted(a, '');
    };

    const cad_pst = function(): string {
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
            doc.documentElement,
            context,
        );
        return util.defaulted(a, '');
    };

    const refund = function (): string {
        let a = getField(
            ['Refund', 'Totale rimborso'].map( //TODO other field names?
                label => sprintf.sprintf(
                    '//div[contains(@id,"od-subtotals")]//' +
                    'span[contains(text(),"%s")]/' +
                    'ancestor::div[1]/following-sibling::div/span',
                    label
                )
            ).join('|'),
            doc.documentElement,
            context,
        );
        return util.defaulted(a, '');
    };

    const invoice_url = function (): string {
        const suffix: string|null = getAttribute(
            '//a[contains(@href, "/invoice")]',
            'href',
            doc.documentElement,
            context,
        );
        if( suffix ) {
            return 'https://' + urls.getSite() + suffix;
        }
        return '';
    };

    const details: IOrderDetails = {
        date: order_date(),
        total: total(),
        postage: postage(),
        postage_refund: postage_refund(),
        gift: gift(),
        us_tax: us_tax(),
        vat: vat(),
        gst: cad_gst(),
        pst: cad_pst(),
        refund: refund(),
        who: who(),
        invoice_url: invoice_url(),
    };

    return details;
}

interface IOrderDetailsAndItems {
    details: IOrderDetails;
    items: item.IItem[];
};

const extractDetailPromise = (
    order: OrderImpl,
    scheduler: request_scheduler.IRequestScheduler
) => new Promise<IOrderDetailsAndItems>(
    (resolve, reject) => {
        const context = 'id:' + order.id;
        const url = order.detail_url;
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
                    details: extractDetailFromDoc(order, doc),
                    items: item.extractItems(
                        util.defaulted(order.id, ''),
                        util.defaulted(order.date, ''),
                        util.defaulted(order.detail_url, ''),
                        doc.documentElement,
                        context,
                    ),
                };
            };
            try {
                scheduler.scheduleToPromise<IOrderDetailsAndItems>(
                    url,
                    event_converter,
                    util.defaulted(order.id, '9999'),
                    false
                ).then(
                    (response: request_scheduler.IResponse<IOrderDetailsAndItems>) => resolve(response.result),
                    url => reject('timeout or other problem when fetching ' + url),
                );
            } catch (ex) {
                const msg = 'scheduler rejected ' + order.id + ' ' + url;
                console.error(msg);
                reject(msg);
            }
        }
    }
);

export interface IOrder extends azad_entity.IEntity {
    id(): Promise<string>;
    detail_url(): Promise<string>;
    invoice_url(): Promise<string>;

    date(): Promise<string>;
    gift(): Promise<string>;
    gst(): Promise<string>;
    item_list(): Promise<item.IItem[]>;
    items(): Promise<item.Items>;
    payments(): Promise<any>;
    postage(): Promise<string>;
    postage_refund(): Promise<string>;
    pst(): Promise<string>;
    refund(): Promise<string>;
    site(): Promise<string>;
    total(): Promise<string>;
    us_tax(): Promise<string>;
    vat(): Promise<string>;
    who(): Promise<string>;

    assembleDiagnostics(): Promise<Record<string,any>>;
};


class Order {
    impl: OrderImpl;

    constructor(impl: OrderImpl) {
        this.impl = impl
    }

    id(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.id, ''));
    }
    list_url(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.list_url, ''));
    }
    detail_url(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.detail_url, ''));
    }
    payments_url(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.payments_url, ''));
    }
    site(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.site, ''));
    }
    date(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.date, ''));
    }
    total(): Promise<string> {
        return this._detail_dependent_promise(detail => detail.total);
    }
    who(): Promise<string> {
        return Promise.resolve(util.defaulted(this.impl.who, ''));
    }
    items(): Promise<item.Items> {
        const items: item.Items = {}; 
        if (this.impl.detail_promise) {
            return this.impl.detail_promise.then( details => {
                details.items.forEach(item => {
                    try {
                        items[item.description] = item.url;
                    } catch (ex) {
                        console.error(ex);
                    }
                });
                return items;
            });
        } else {
            return Promise.resolve(items);
        }
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
        detail_lambda: (d: IOrderDetails) => string
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

    assembleDiagnostics(): Promise<Record<string,any>> {
        return this.impl.assembleDiagnostics();
    }
}

class OrderImpl {
    id: string|null;
    site: string|null;
    list_url: string|null;
    detail_url: string|null;
    payments_url: string|null;
    invoice_url: string|null;
    date: string|null;
    total: string|null;
    who: string|null;
    detail_promise: Promise<IOrderDetailsAndItems>|null;
    payments_promise: Promise<string[]>|null;
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
        this.payments_url = null;
        this.invoice_url = null;
        this.date = null;
        this.total = null;
        this.who = null;
        this.detail_promise = null;
        this.payments_promise = null;
        this.scheduler = scheduler;
        this._extractOrder(ordersPageElem);
    }
    _extractOrder(elem: HTMLElement) {
        const doc = elem.ownerDocument;

        try {
            this.id = [
                ...Array.prototype.slice.call(elem.getElementsByTagName('a'))
            ].filter( el => el.hasAttribute('href') )
             .map( el => el.getAttribute('href') )
             .map( href => href.match(/.*(?:orderID=|orderNumber%3D)([A-Z0-9-]*).*/) )
             .filter( match => match )[0][1];
        } catch (error) {
            console.warn(
                'could not parse order id from order list page ' + this.list_url
            );
            this.id = 'UNKNOWN_ORDER_ID';
            throw error;
        }

        const context = 'id:' + this.id;
        this.date = date.normalizeDateString(
            util.defaulted(
                getField(
                    [
                        'Commande effectuée',
                        'Order placed',
                        'Ordine effettuato',
                         'Pedido realizado'
                    ].map(
                        label => sprintf.sprintf(
                            './/div[contains(span,"%s")]' +
                            '/../div/span[contains(@class,"value")]',
                            label
                        )
                    ).join('|'),
                    elem,
                    context,
                ),
                ''
            )
        );
        // This field is no longer always available, particularly for .com
        // We replace it (where we know the search pattern for the country)
        // with information from the order detail page.
        this.total = getField('.//div[contains(span,"Total")]' +
            '/../div/span[contains(@class,"value")]', elem, context);
        console.log('total direct:', this.total);
        this.who = getField('.//div[contains(@class,"recipient")]' +
            '//span[@class="trigger-text"]', elem, context);

        this.site = function(o: OrderImpl) {
            if (o.list_url) {
                const list_url_match = o.list_url.match(
                    RegExp('.*\/\/([^/]*)'));
                if (list_url_match) {
                    return util.defaulted(list_url_match[1], '');
                }
            }
            return '';
        }(this);

        if (!this.id) {
            const id_node: Node = util.findSingleNodeValue(
                '//a[contains(@class, "a-button-text") and contains(@href, "orderID=")]/text()[normalize-space(.)="Order details"]/parent::*',
                elem,
                context,
            );
            const id_elem: HTMLElement = <HTMLElement>id_node;
            const more_than_id: string|null = id_elem.getAttribute('href');
            if (more_than_id) {
                const match = more_than_id.match(/.*orderID=([^?]*)/);
                if (match && match.length > 1) {
                    this.id = match[1];
                }
            }
        }

        if (this.id && this.site) {
            this.detail_url = urls.orderDetailUrlFromListElement(
                elem, this.id, this.site
            );
            this.payments_url = urls.getOrderPaymentUrl(this.id, this.site);
        }
        this.detail_promise = extractDetailPromise(this, this.scheduler);
        this.payments_promise = new Promise<string[]>(
            (
                (
                    resolve: (payments: string[]) => void,
                    reject: (msg: string) => void
                ) => {
                    if (this.id?.startsWith('D')) {
                        resolve([
                            this.total ?
                                util.defaulted(this.date, '') + 
                                ': ' + util.defaulted(this.total, '') :
                                util.defaulted(this.date, '')
                        ]);
                    } else {
                        const event_converter = function(evt: any) {
                            const doc = util.parseStringToDOM( evt.target.responseText );
                            const payments = extraction.payments_from_invoice(doc);
                            // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
                            return payments;
                        }.bind(this);
                        if (this.payments_url) {
                            this.scheduler.scheduleToPromise<string[]>(
                                this.payments_url,
                                event_converter,
                                util.defaulted(this.id, '9999'), // priority
                                false  // nocache
                            ).then(
                                (response: {result: string[]}) => resolve(response.result),
                                (url: string) => reject( 'timeout or other error while fetching ' + url )
                            );
                        } else {
                            reject('cannot fetch payments without payments_url');
                        }
                    }
                }
            ).bind(this)
        );
    }

    assembleDiagnostics(): Promise<Record<string,any>> {
        const diagnostics: Record<string, any> = {};
        const field_names: (keyof OrderImpl)[] = [
            'id',
            'list_url',
            'detail_url',
            'payments_url',
            'date',
            'total',
            'who',
        ];
        field_names.forEach(
            ((field_name: keyof OrderImpl) => {
                const value: any = this[field_name];
                diagnostics[<string>(field_name)] = value;
            })
        );

        const order = new Order(this);
        const items_promise = order.items();
        items_promise.then( items => {
            diagnostics['items'] = items;
        });

        return Promise.all([
            items_promise,
            signin.checkedFetch( util.defaulted(this.list_url, '') )
                .then( response => response.text())
                .then( text => { diagnostics['list_html'] = text; } ),
            signin.checkedFetch( util.defaulted(this.detail_url, '') )
                .then( response => response.text() )
                .then( text => { diagnostics['detail_html'] = text; } ),
            signin.checkedFetch(util.defaulted(this.payments_url, ''))
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
}

interface IOrdersPageData {
    expected_order_count: number;
    order_elems: dom2json.IJsonObject;
};

function getOrdersForYearAndQueryTemplate(
    year: number,
    query_template: string,
    scheduler: request_scheduler.IRequestScheduler,
    nocache_top_level: boolean
): Promise<Promise<IOrder>[]> {
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
        }
        return converted;
    };

    const expected_order_count_promise: Promise<number> = scheduler.scheduleToPromise<IOrdersPageData>(
        generateQueryString(0),
        convertOrdersPage,
        '00000',
        nocache_top_level
    ).then(
        response => response.result.expected_order_count
    );

    const translateOrdersPageData = function(
        response: request_scheduler.IResponse<IOrdersPageData>
    ): Promise<IOrder>[] {
        const orders_page_data = response.result;
        const order_elems = orders_page_data.order_elems.map(
            (elem: any) => dom2json.toDOM(elem)
        );
        function makeOrderPromise(elem: HTMLElement): Promise<IOrder> {
            const order = create(elem, scheduler, response.query);
            return Promise.resolve(order);
        }
        const promises = order_elems.map(makeOrderPromise);
        return promises;
    };

    const getOrderPromises = function(expected_order_count: number): Promise<Promise<IOrder>[]> {
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
                        const promises = translateOrdersPageData(page_data);
                        order_promises.push(...promises);
                    }
                ).then(
                    () => null,
                    (msg) => {
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

    return expected_order_count_promise.then( getOrderPromises );
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
    let templates = templates_by_site[urls.getSite()];
    if ( !templates ) {
        templates = templates_by_site['other'];
        notice.showNotificationBar(
            'Your site is not fully supported.\n' +
            'For better support, click on the popup where it says\n' +
            '"CLICK HERE if you get incorrect results!",\n' +
            'and provide the diagnostic information',
            document
        );
    }

    const promises_to_promises: Array<Promise<any>> = templates.map(
        template => template + '&disableCsd=no-js'
    ).map(
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

export function create(
    ordersPageElem: HTMLElement,
    scheduler: request_scheduler.IRequestScheduler,
    src_query: string
): IOrder {
    const impl = new OrderImpl(ordersPageElem, scheduler, src_query);
    const wrapper = new Order(impl);
    return wrapper;
}

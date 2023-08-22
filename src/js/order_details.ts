/* Copyright(c) 2023 Philip Mulcahy. */

import * as date from './date';
import * as extraction from './extraction';
import * as item from './item';
import * as order_header from './order_header';
import * as request_scheduler from './request_scheduler';
import * as shipment from './shipment';
import * as sprintf from 'sprintf-js';
import * as urls from './url';
import * as util from './util';

export interface IOrderDetails {
    date: Date|null;
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
};

export interface IOrderDetailsAndItems {
    details: IOrderDetails;
    items: item.IItem[];
    shipments: shipment.IShipment[];
};

export function extractDetailPromise(
    header: order_header.IOrderHeader,
    scheduler: request_scheduler.IRequestScheduler
): Promise<IOrderDetailsAndItems> {
  return new Promise<IOrderDetailsAndItems>(
    (resolve, reject) => {
        const context = 'id:' + header.id;
        const url = header.detail_url;
        if(!url) {
            const msg = 'null order detail query: cannot schedule';
            console.error(msg);
            reject(msg);
        } else {
            const event_converter = function(
                evt: { target: { responseText: string; }; }
            ): IOrderDetailsAndItems {
                const doc = util.parseStringToDOM( evt.target.responseText );
                const shipments = shipment.get_shipments(doc, header, context);
                shipments.forEach(
                  s => console.log('shipment: ' + s.toString()));
                return {
                    details: extractDetailFromDoc(header, doc),
                    items: item.extractItems(
                        doc.documentElement,
                        header,
                        context
                    ),
                    shipments: shipments,
                };
            };
            try {
                scheduler.scheduleToPromise<IOrderDetailsAndItems>(
                    url,
                    event_converter,
                    util.defaulted(header.id, '9999'),
                    false
                ).then(
                    (response: request_scheduler.IResponse<IOrderDetailsAndItems>) => {
                      resolve(response.result)
                    },
                    url => {
                      const msg = 'scheduler rejected ' + header.id + ' ' + url;
                      console.error(msg);
                      reject('timeout or other problem when fetching ' + url)
                    },
                );
            } catch (ex) {
                const msg = 'scheduler upfront rejected ' + header.id + ' ' + url;
                console.error(msg);
                reject(msg);
            }
        }
    }
  );
}

function extractDetailFromDoc(
    header: order_header.IOrderHeader,
    doc: HTMLDocument,
): IOrderDetails {
    const context = 'id:' + header.id;
    const who = function(){
        if(header.who) {
            return header.who;
        }

        const doc_elem = doc.documentElement;

        let x = util.getField(
            // TODO: this seems brittle, depending on the precise path of the element.
            '//table[contains(@class,"sample")]/tbody/tr/td/div/text()[2]',
            doc_elem,
            context
        ); // US Digital
        if(x) return x;

        x = util.getField('.//div[contains(@class,"recipient")]' +
            '//span[@class="trigger-text"]', doc_elem, context);
        if(x) return x;

        x = util.getField(
            './/div[contains(text(),"Recipient")]',
            doc_elem,
            context
        );
        if(x) return x;

        x = util.getField(
            '//li[contains(@class,"displayAddressFullName")]/text()',
            doc_elem,
            context,
        );

        if ( !x ) {
            x = 'null';
        }

        return x;
    };

    const order_date = function(): Date|null {
        const def_string = header.date ?
            util.dateToDateIsoString(header.date):
            null;
        const d = extraction.by_regex(
            [
                '//*[contains(@class,"order-date-invoice-item")]/text()',
                '//*[contains(@class, "orderSummary")]//*[contains(text(), "Digital Order: ")]/text()',
            ],
            /(?:Ordered on|Commandé le|Digital Order:) (.*)/i,
            def_string,
            doc.documentElement,
            context,
        );
        if (d) {
            return new Date(date.normalizeDateString(d));
        }
        return util.defaulted(header.date, null);
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
            header.total,
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
            a = util.getField(
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
        let a = util.getField(
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

    const invoice_url: string = function (): string {
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
    }();

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
        invoice_url: invoice_url,
    };

    return details;
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

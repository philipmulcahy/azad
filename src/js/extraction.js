/* Copyright(c) 2019 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

import util from './util';
import $ from 'jquery';
import sprintf from 'sprintf-js';

"use strict";

const by_regex = function(xpaths, regex, default_value, elem) {
    let i;
    for ( i=0; i!=xpaths.length; i++ ) {
        let a = null;
        const xpath = xpaths[i];
        try {
            a = util.findSingleNodeValue(
                xpath,
                elem
            );
        } catch (ex) {
            console.warn('got ' + ex + ' when evaluating ' + xpath);
        }
        if ( a ) {
            if ( regex ) {
                const match = a.textContent.trim().match(regex);
                if (match !== null) {
                    return match[1];
                }
            } else {
                return a.textContent.trim();
            }
        }
    }
    return $.isNumeric(default_value) ?
        default_value.toString() :
        default_value;
};

const payments_from_invoice = function(doc) {
    // Returns ["American Express ending in 1234: 12 May 2019: £83.58", ...]
    const strategy_1 = () => {
        const payments = util.findMultipleNodeValues(
            [
                'Credit Card transactions',
                'Transactions de carte de crédit'
            ].map(
                label => sprintf.sprintf(
                    '//b[contains(text(),"%s")]/' +
                    '../../..//td[contains(text(),":")]/..',
                    label
                )
            ).join('|'),
            doc.documentElement
        ).map(function(row){
            return row.textContent
                      .replace(/[\n\r]/g, ' ')
                      .replace(/  */g, '\xa0')  //&nbsp;
                      .trim();
        });
        return payments;
    };
    const strategy_2 = () => {
        const new_style_payments = util.findMultipleNodeValues(
            '//*[contains(text(), "Payment Method")]/../self::*',
            doc.documentElement
        ).map(
            e => e.textContent.replace(/\s+/g, ' ').trim()
        );
        // "Item(s) Subtotal: GBP 9.63 Shipping & Handling: GBP 4.24 ----- Total before tax: GBP 13.87 Estimated tax to be collected: GBP 1.22 ----- Grand Total: GBP 15.09 Payment Method: American Express | Last digits: 1416 Billing address Mr Philip Mulcahy Somewhere in the UK"
        const card_names = new_style_payments.map(
            s => /Payment Method: ([A-Za-z0-9 /]*) \|/.exec(s)[1].trim()
        );
        const card_number_suffixes = new_style_payments.map(
            s => /Last digits: (\d+)/.exec(s)[1]
        );
        const payment_amounts = new_style_payments.map(
            s => /Grand Total: (.*) Payment Method/.exec(s)[1].trim()
        );
        const count = Math.min( ...[card_names, card_number_suffixes, payment_amounts].map( l => l.length ) );
        const payments = [];
        let i = 0;
        for ( i = 0; i < count; i++ ) {
            payments.push( card_names[i] + ' ending in ' + card_number_suffixes[i] + ': ' + payment_amounts[i] );
        }
        return payments;
    };
    const strategies = [strategy_1, strategy_2];
    let i = 0;
    for ( i = 0; i < strategies.length; i++ ) {
        const strategy = strategies[i];
        const payments = strategy();
        if (payments && payments.length) {
            return payments;
        }
    }
    return [];
};

export default {
    by_regex: by_regex,
    payments_from_invoice: payments_from_invoice
};

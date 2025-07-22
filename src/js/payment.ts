/* Copyright(c) 2025 Philip Mulcahy. */

import * as extraction from './extraction';
import { sprintf } from 'sprintf-js';
import * as util from './util';

export function payments_from_invoice(doc: HTMLDocument): string[] {
  // Returns ["American Express ending in 1234: 12 May 2019: £83.58", ...]
  function strategy_1(): string[] {
    const payments: string[] = extraction.findMultipleNodeValues(
      [
        'Credit Card transactions',
        'Transactions de carte de crédit'
      ].map(
        label => sprintf(
          '//b[contains(text(),"%s")]/' +
          '../../..//td[contains(text(),":")]/..',
          label
        )
      ).join('|'),
      doc.documentElement
    ).map(function(row){
      return util.defaulted(
        row.textContent
          ?.replace(/[\n\r]/g, ' ')
           .replace(/  */g, '\xa0')  //&nbsp;
           .trim(),
        ''
      );
    });
    return payments;
  };
  function strategy_2(): string[] {
    const new_style_payments = extraction.findMultipleNodeValues(
      '//*[contains(text(), "Payment Method")]/../self::*',
      doc.documentElement
    ).map(
      e => e.textContent?.replace(/\s+/g, ' ').trim()
    );
    // "Item(s) Subtotal: GBP 9.63 Shipping & Handling: GBP 4.24 ----- Total before tax: GBP 13.87 Estimated tax to be collected: GBP 1.22 ----- Grand Total: GBP 15.09 Payment Method: American Express | Last digits: 1416 Billing address Mr Philip Mulcahy Somewhere in the UK"

    const map_payment_field = function(pattern: RegExp) {
      return new_style_payments.map(
        function(s) {
          const y = pattern.exec(util.defaulted(s, ''));

          if (y == null) {
            return '';
          }

          return y[1].trim();
        }
      );
    };

    const card_names: string[] = map_payment_field(
      /Payment Method: ([A-Za-z0-9 /]*) \|/,
    );

    const card_number_suffixes = map_payment_field(
      /Last digits: (\d+)/i,
    );

    const payment_amounts = map_payment_field(
      /Grand Total: (.*) Payment Method/i,
    );

    const count = Math.min(
      ...[card_names, card_number_suffixes, payment_amounts].map(
        l => l.length
      )
    );

    const payments = [];
    let i = 0;
    for ( i = 0; i < count; i++ ) {
      payments.push(
        card_names[i] +
          ' ending in ' + card_number_suffixes[i] + ': '
        + payment_amounts[i]
      );
    }

    return payments;
  };

  function strategy_3(): string[] {
    const roots = extraction.findMultipleNodeValues(
      '//*[@data-component="viewPaymentPlanSummaryWidget"]//*[contains(@class, "pmts-payments-instrument-detail-box")]',
      doc.documentElement
    );

    // remove non visible text such as scripts and styles
    for (const r of roots) {
      for (const tag of ['script', 'style']) {
        (r as Element).querySelectorAll(tag).forEach(el => el.remove());
      }
    }

    const texts: string[] = roots.map(
      e => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );

    return texts;
  }

  const strategies = [strategy_1, strategy_2, strategy_3];
  const payments = extraction.firstMatchingStrategy<string[]>(strategies, ['UNKNOWN']);
  return payments;
}

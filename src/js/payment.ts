/* Copyright(c) 2025 Philip Mulcahy. */

import {dateToDateIsoString} from './date';
import * as extraction from './extraction';
import * as order_header from './order_header';
import * as req from './request';
import * as request_scheduler from './request_scheduler';
import { sprintf } from 'sprintf-js';
import * as util from './util';

export type Payments = string[];

function payments_from_invoice(
  invoiceDoc: HTMLDocument,
  defaultDate: Date | null,
  defaultAmount: string,
): string[] {
  // Returns ["American Express ending in 1234: 12 May 2019: £83.58", ...]
  // or a truncated version (card details only).
  function strategy_1(): Payments {
    const payments: Payments = extraction.findMultipleNodeValues(
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
      invoiceDoc.documentElement
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
  }

  function strategy_2(): Payments {
    const new_style_payments = extraction.findMultipleNodeValues(
      '//*[contains(text(), "Payment Method")]/../self::*',
      invoiceDoc.documentElement
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
    ).filter(name => name.length);

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
  }

  function strategy_3(): Payments {
    const roots = extraction.findMultipleNodeValues(
      '//*[@data-component="viewPaymentPlanSummaryWidget"]//*[contains(@class, "pmts-payments-instrument-detail-box")]',
      invoiceDoc.documentElement
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

    if (texts.length === 1 && defaultDate && defaultAmount !== '') {
      const dateString = dateToDateIsoString(defaultDate);

      return [
        `${texts[0]}: ${dateString}: ${defaultAmount}`,
      ];
    }

    return texts;
  }

  const payments = extraction.firstMatchingStrategy<Payments>(
    'paymentsFromInvoice',
    [strategy_1, strategy_2, strategy_3],
    ['UNKNOWN']
  );

  return payments;
}

export function paymentsFromDetailPage(
  detailDoc: HTMLDocument,
  defaultOrderDate: Date | null,
  defaultTotal: string,

): Payments {
  const card_detailss = extraction.findMultipleNodeValues(
    '//*[contains(@class, "paystationpaymentmethod")]',
    detailDoc.documentElement,
    'order_details_payments',
  );

  if (card_detailss.length != 1) {
    return [];
  }
  
  return [
    [
      card_detailss[0],
      defaultOrderDate ? dateToDateIsoString(defaultOrderDate) : '?',
      defaultTotal,
    ].join(': ')
  ];
}

export async function fetch_payments(
  scheduler: request_scheduler.IRequestScheduler,
  orderHeader: order_header.IOrderHeader,
): Promise<Payments> {
  if (orderHeader.id?.startsWith('D')) {
    const d = orderHeader.date?
      dateToDateIsoString(orderHeader.date) :
      '';

    return Promise.resolve([
      orderHeader.total ?
        d + ': ' + orderHeader.total :
        d
    ]);
  }

  const event_converter = function(evt: any): Payments {
    const invoiceDoc = util.parseStringToDOM(evt.target.responseText);

    const payments = payments_from_invoice(
      invoiceDoc,
      orderHeader.date,
      orderHeader.total ?? '',
    );

    // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
    return payments;
  };

  const url = orderHeader.payments_url;

  if (!url) {
    throw('cannot fetch payments without payments_url');
  }

  try {
    return await req.makeAsyncStaticRequest<Payments>(
      url,
      'fetch_payments',
      event_converter,
      scheduler,
      util.defaulted(orderHeader.id, '9999'), // priority
      false,  // nocache,
      'payments for ' + orderHeader.id,  // debug_context
    );
  } catch (ex) {
    const msg = 'timeout or other error while fetching ' + url +
                ' for ' + orderHeader.id + ': ' + ex;

    console.error(msg);
    return [];
  }
}

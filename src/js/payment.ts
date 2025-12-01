/* Copyright(c) 2025 Philip Mulcahy. */

import {dateToDateIsoString} from './date';
import * as extraction from './extraction';
import * as order_header from './order_header';
import * as req from './request';
import * as request_scheduler from './request_scheduler';
import {sprintf} from 'sprintf-js';
import * as strategy from './strategy';
import {ClassedNode, TopologicalScrape} from './topology';
import * as util from './util';

export type Payment = string;
export type Payments = Payment[];

function payments_from_invoice(
  invoiceDoc: HTMLDocument,
  defaultDate: Date | null,
  defaultAmount: string,
): string[] {
  // Returns ["American Express ending in 1234: 12 May 2019: £83.58", ...]
  // or a truncated version (card details only).
  function strategy_1(): Payments {
    const paymentStrings: string[] = extraction.findMultipleNodeValues(
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
    ).map(
      row => util.defaulted(
        row.textContent
          ?.replace(/[\n\r]/g, ' ')  // remove newlines and carriage returns
           .replace(/  */g, ' ')  // dedupe
           .replace(/ : /g, ': ')
           .replace(/ /g, '\xa0')  // xa0 == &nbsp
           .trim(),
        ''
      )
    );

    return paymentStrings;
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

    const payments: Payments = [];
    let i = 0;

    for ( i = 0; i < count; i++ ) {
      const p: Payment = (`${card_names[i]} ending in ${card_number_suffixes[i]}: ${payment_amounts[i]}`);

      payments.push(p);
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
      const p: Payment = `${texts[0]}: ${dateString}: ${defaultAmount}`;
      return [p] as Payments;
    }

    return texts as Payments;
  }

  const payments = strategy.firstMatchingStrategy<Payments>(
    'paymentsFromInvoice',
    [strategy_1, strategy_2, strategy_3],
    [],
  );

  return payments;
}

export function paymentsFromDetailPage(
  detailDoc: HTMLDocument,
  defaultOrderDate: Date | null,
  defaultTotal: string,
): Payments {

  function strategy0(): Payments {
    const nodes = extraction.findMultipleNodeValues(
      '//*[contains(@class, "paystationpaymentmethod")]',
      detailDoc.documentElement,
      'order_details_payments',
    );

    if (!nodes) {
      return [];
    }

    const cardTextNodes = util.textNodesUnder(nodes[0]);

    if (!cardTextNodes) {
      return [];
    }

    const cardText = cardTextNodes.map(n => n.textContent).join(' ');

    const paymentStrings: string[] = [
      [
        cardText,
        defaultOrderDate ? dateToDateIsoString(defaultOrderDate) : '?',
        defaultTotal,
      ].join(': ')
    ];

    return paymentStrings.map(ps => ps as Payment) as Payments;
  }

  function strategy1(): Payments {
    // Indentation here reflects expected topology to help understand code: it has
    // no significance to the actual behaviour of the code.
    enum Component {
      PAYMENT_SOURCES = 'payment_sources',  // composite, no entry in patterns below.
        PAYMENT_SOURCE = 'payment_source',  // composite, no entry in patterns below.
          GIFT_CARD = 'gift_card',
    //    or
          CARD_DETAILS = 'card_details',  // composite, no entry in patterns below.
            CARD_NAME = 'card_name',
            BLANKED_DIGITS = 'blanked_digits',
             CARD_DIGITS = 'card_digits',
    }

    const patterns = new Map<Component, RegExp>([
      [Component.BLANKED_DIGITS, new RegExp('([•*]{3,4})')],
      [Component.CARD_DIGITS, new RegExp('([0-9]{3,4})')],
      [Component.CARD_NAME, new RegExp('([A-Za-z][A-Za-z0-9. ]{2,49})')],
      [Component.GIFT_CARD,
       new RegExp('(Amazon Gift Card|Amazon-Geschenkgutschein)')],
    ]);

    // This function has grown to feel sordid, and hard to understand.
    // I would like instead to adopt one of the following strategies:
    // 1) write BNF including replacing the regular expressions.
    // 2) identify the leaf components with regex, and then BNF driven parser.
    function classifyNode(n: ClassedNode<Component>): Set<Component> {
      if (n.isNonScriptText) {
        // Simple text node: regexes allow us to classify.
        const candidates = new Set<Component>(
          [...patterns.keys()].filter(p => n.match(p) != null));

        if (candidates.has(Component.CARD_DIGITS)) {
            if (n.hasSiblingToLeft(
              s => s.components.has(Component.BLANKED_DIGITS)
            )) {
              candidates.clear();
              candidates.add(Component.CARD_DIGITS);
            } else {
              candidates.delete(Component.CARD_DIGITS);
            }
        }

        return candidates;
      }

      // We need to look below ourselves to figure out what we might be.
      const possibles: Set<Component> = new Set<Component>();
      const descendants = n.classedDescendants;

      function countDescendants(cn: Component): number {
        return descendants.filter(d => d.components.has(cn)).length;
      }

      if (
        countDescendants(Component.PAYMENT_SOURCES) == 0 && (
          countDescendants(Component.PAYMENT_SOURCE) >= 1
        )      ) {
        possibles.add(Component.PAYMENT_SOURCES);
      }

      if (
        countDescendants(Component.PAYMENT_SOURCE) == 0 &&
        (
          (
            countDescendants(Component.CARD_DETAILS) == 1 &&
            countDescendants(Component.GIFT_CARD) == 0
          ) || (
            countDescendants(Component.CARD_DETAILS) == 0 &&
            countDescendants(Component.GIFT_CARD) == 1
          )
        )
      ) {
        possibles.add(Component.PAYMENT_SOURCE);
      }

      if (
        countDescendants(Component.GIFT_CARD) == 0 &&
        countDescendants(Component.CARD_DETAILS) == 0 &&
        countDescendants(Component.PAYMENT_SOURCE) == 0 &&
        countDescendants(Component.CARD_NAME) >= 1 &&
        countDescendants(Component.BLANKED_DIGITS) == 1 &&
        countDescendants(Component.CARD_DIGITS) == 1
      ) {
        possibles.add(Component.CARD_DETAILS);
      }

      if (
        countDescendants(Component.CARD_DETAILS) == 0 &&
        countDescendants(Component.PAYMENT_SOURCE) == 0 &&
        countDescendants(Component.GIFT_CARD) == 1
      ) {
        possibles.add(Component.GIFT_CARD);
      }

      return possibles;
    }

    const t = new TopologicalScrape<Component>(
      patterns,
      classifyNode,
      detailDoc.documentElement,
    );

    const result = t.classified
      .filter(n => n.components.has(Component.PAYMENT_SOURCE))
      .map(n => n.text);

    return result;
  }

  return strategy.firstMatchingStrategy(
    "payment.paymentsFromDetailPage",
    [
      strategy0,
      strategy1,
    ],
    [],
  );
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

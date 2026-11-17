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

const PAYMENT_PLAN_WIDGET_XPATH =
  '//*[@data-component="viewPaymentPlanSummaryWidget"]';
const AAPI_PAYMENT_METHODS_XPATH =
  '//*[@data-component="aapiPaymentMethods"]';
const LEGACY_INSTRUMENT_BOX_CLASS = 'pmts-payments-instrument-detail-box';
const PAYMENT_INSTRUMENT_XPATH = './/*[@data-testid="payment-instrument"]';
const PAYMENT_METHOD_ARIA_XPATH = './/*[@aria-label="payment method"]';
const PAYMENT_INSTRUMENT_MESSAGE_TESTID = 'payment-instrument-message';
const CARD_ENDING_IN_PHRASE = 'ending in';
const NON_CARD_PAYMENT_TERMS = [
  util.GIFT_CARD_REGEX.source,
  ...[
    util.GIFT_CARD_LABEL,
    util.GIFT_CERTIFICATE_LABEL,
    util.BUONO_REGALO_LABEL,
  ].map(label => label.replace(/ /g, '\\s*')),
  'carte\\s*cadeau',
  'tarjeta\\s*regalo',
  'reward\\s*points',
];

function extractVisibleText(node: Node, clone = false): string {
  const target = (clone ? node.cloneNode(true) : node) as Element;

  for (const tag of ['script', 'style']) {
    target.querySelectorAll(tag).forEach(el => el.remove());
  }

  return target.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function formatPayment(
  source: string,
  orderDate: Date | null,
  amount: string,
): Payment {
  const dateString = orderDate ? dateToDateIsoString(orderDate) : '?';
  return `${source}: ${dateString}: ${amount}`;
}

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
      new RegExp(`${util.GRAND_TOTAL_LABEL}: (.*) Payment Method`, 'i'),
    );

    const count = Math.min(
      ...[card_names, card_number_suffixes, payment_amounts].map(
        l => l.length
      )
    );

    const payments: Payments = [];
    let i = 0;

    for ( i = 0; i < count; i++ ) {
      const p: Payment = `${card_names[i]} ${CARD_ENDING_IN_PHRASE} ${card_number_suffixes[i]}: ${payment_amounts[i]}`;

      payments.push(p);
    }

    return payments;
  }

  function strategy_3(): Payments {
    const roots = extraction.findMultipleNodeValues(
      `${PAYMENT_PLAN_WIDGET_XPATH}//*[contains(@class, "${LEGACY_INSTRUMENT_BOX_CLASS}")]`,
      invoiceDoc.documentElement
    );

    const texts: string[] = roots.map(r => extractVisibleText(r));

    if (texts.length === 1 && defaultDate && defaultAmount !== '') {
      return [formatPayment(texts[0], defaultDate, defaultAmount)];
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
  giftAmount: string = '',
): Payments {

  function strategy0(): Payments {
    const nodes = extraction.findMultipleNodeValues(
      '//*[contains(@class, "paystationpaymentmethod")]',
      detailDoc.documentElement,
      'order_details_payments',
    );

    if (!nodes || nodes.length == 0) {
      return [];
    }

    const cardTextNodes = util.textNodesUnder(nodes[0]);

    if (!cardTextNodes) {
      return [];
    }

    const cardText = cardTextNodes.map(n => n.textContent).join(' ');

    return [formatPayment(cardText, defaultOrderDate, defaultTotal)];
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
      [Component.BLANKED_DIGITS, util.CARD_MASKED_DIGITS_REGEX],
      [Component.CARD_DIGITS, util.CARD_LAST_DIGITS_REGEX],
      [Component.CARD_NAME, util.CARD_NAME_REGEX],
      [Component.GIFT_CARD, util.GIFT_CARD_REGEX],
    ]);

    // This function has grown to feel sordid, and hard to understand.
    // I would like instead to adopt one of the following strategies:
    // 1) write BNF including replacing the regular expressions.
    // 2) identify the leaf components with regex, and then BNF driven parser.
    function classifyNode(n: ClassedNode<Component>): Set<Component> {
      if (n.isNonScriptText) {
        // Simple text node: regexes allow us to classify.
        const candidates = new Set<Component>(
          Array.from(patterns.keys()).filter(p => n.match(p) != null)
        );

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

    const sources = t.classified
      .filter(n => n.components.has(Component.PAYMENT_SOURCE))
      .map(n => n.text);

    if (sources.length == 1) {
      return [formatPayment(sources[0], defaultOrderDate, defaultTotal)];
    } else {
      return sources;
    }
  }

  // NOTE: This strategy intentionally breaks the project principle of
  // "don't make stuff up, assume, extrapolate or interpolate from what Amazon
  // html tells us" by copying the order total onto a payment card row that
  // does not itself state an amount. To keep that assumption as safe as
  // possible, it only fires when ALL of the following constraints hold:
  // 1) There is a single card details row, and no other payment information
  //    (such as a gift card or second/subsequent payment card details).
  // 2) The row does not already include a payment amount.
  // 3) The order detail page includes an unambiguous order total ccy amount
  //    that can be copied.
  function strategy2(): Payments {
    const trimmedTotal = defaultTotal.trim();
    const ccyAmountPattern = new RegExp(
      `^${util.positiveCurrencyAmountRegex().source}$`
    );

    // Constraint 3: unambiguous order total currency amount.
    if (!ccyAmountPattern.test(trimmedTotal)) {
      return [];
    }

    // Constraint 1: no gift card amount and no other payment information in
    // aapiPaymentMethods or multiple payment instruments.
    if (giftAmount.trim() !== '') {
      return [];
    }

    const aapiPaymentNodes = extraction.findMultipleNodeValues(
      AAPI_PAYMENT_METHODS_XPATH,
      detailDoc.documentElement,
    );
    const hasAapiPaymentText = aapiPaymentNodes.some(
      n => (n.textContent?.trim() ?? '') !== '',
    );

    if (hasAapiPaymentText) {
      return [];
    }

    const widgetNodes = extraction.findMultipleNodeValues(
      PAYMENT_PLAN_WIDGET_XPATH,
      detailDoc.documentElement,
    );

    if (widgetNodes.length !== 1) {
      return [];
    }

    const widget = widgetNodes[0] as HTMLElement;
    const instrumentNodes = extraction.findMultipleNodeValues(
      PAYMENT_INSTRUMENT_XPATH,
      widget,
    );
    const labelledMethodNodes = extraction.findMultipleNodeValues(
      PAYMENT_METHOD_ARIA_XPATH,
      widget,
    );

    if (instrumentNodes.length > 1 || labelledMethodNodes.length > 1) {
      return [];
    }

    const rowNodes = extraction.findMultipleNodeValues(
      `.//*[@data-testid="${PAYMENT_INSTRUMENT_MESSAGE_TESTID}" ` +
      `or contains(@class, "${LEGACY_INSTRUMENT_BOX_CLASS}")]`,
      widget,
    );

    if (rowNodes.length !== 1) {
      return [];
    }

    const cardText = extractVisibleText(rowNodes[0], true);
    const cardDetailsPattern = new RegExp(
      `(?:${util.CARD_MASKED_DIGITS_REGEX.source}|${CARD_ENDING_IN_PHRASE})\\s*${util.CARD_LAST_DIGITS_REGEX.source}`,
      'i'
    );
    const nonCardPattern = new RegExp(NON_CARD_PAYMENT_TERMS.join('|'), 'i');

    if (!cardDetailsPattern.test(cardText) || nonCardPattern.test(cardText)) {
      return [];
    }

    // Constraint 2: the row itself does not include a payment amount.
    if (
      util.positiveCurrencyAmountRegex().test(cardText) ||
      util.moneyRegEx().test(cardText)
    ) {
      return [];
    }

    return [formatPayment(cardText, defaultOrderDate, trimmedTotal)];
  }

  return strategy.firstMatchingStrategy(
    "payment.paymentsFromDetailPage",
    [
      strategy0,
      strategy1,
      strategy2,
    ],
    [],
  );
}

function paymentsFromResponseEvent(
  evt: req.AzadResponseEvent,
  orderHeader: order_header.IOrderHeader,
): Payments {
  if (!evt.target?.responseText) {
    throw new Error('XHR responseText unavailable');
  }

  const invoiceDoc = util.parseStringToDOM(evt.target.responseText);

  return payments_from_invoice(
    invoiceDoc,
    orderHeader.date,
    orderHeader.total ?? '',
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

  const url = orderHeader.payments_url;

  if (!url) {
    throw('cannot fetch payments without payments_url');
  }

  try {
    const payments = await req.makeAsyncStaticRequest<Payments>(
      url,
      'fetch_payments',
      (evt) => paymentsFromResponseEvent(evt, orderHeader),
      scheduler,
      util.defaulted(orderHeader.id, '9999'), // priority
      false,  // nocache,
      'payments for ' + orderHeader.id,  // debug_context
    );

    return payments;
  } catch (ex) {
    const msg = 'timeout or other error while fetching ' + url +
                ' for ' + orderHeader.id + ': ' + ex;

    console.error(msg);
    return [];
  }
}

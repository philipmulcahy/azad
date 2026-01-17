/* Copyright(c) 2025..2026 Philip Mulcahy. */

///////////////////////////////////////////////////////////////////////////////
// Use "topology" based strategy to parse transaction pages.
///////////////////////////////////////////////////////////////////////////////

import * as dt from './date';
import * as util from './util';
import {Transaction} from './transaction';
import {ClassedNode, TopologicalScrape} from './topology';

// Indentation here reflects expected topology to help understand code: it has
// no significance to the actual behaviour of the code.
export enum Component {
  TRANSACTION = 'transaction',  // composite, no entry in patterns below.
    DATE = 'date',
    ORDER_ID = 'order_id',
    CURRENCY_AMOUNT = 'currency_amount',
    PAYMENT_SOURCE = 'payment_source',  // composite, no entry in patterns below.
      GIFT_CARD = 'gift_card',
//    or
      CARD_DETAILS = 'card_details',  // composite, no entry in patterns below.
        CARD_NAME = 'card_name',
        BLANKED_DIGITS = 'blanked_digits',
        CARD_DIGITS = 'card_digits',
    PAYMENT_STATUS = 'payment_status',
    VENDOR = 'vendor',
}

export const patterns = new Map<Component, RegExp>([
  [Component.BLANKED_DIGITS, new RegExp('([•*]{3,4})')],
  [Component.CARD_DIGITS, new RegExp('([0-9]{3,4})')],
  [Component.CARD_NAME, new RegExp('([A-Za-z][A-Za-z0-9. ]{2,49})')],

  [Component.CURRENCY_AMOUNT,
    new RegExp(`(-? *${util.currencyRegex().source} *\\d[0-9,.]*)`)],

  [Component.DATE, new RegExp(`(${dt.getDateRegex().source})`)],

  [Component.GIFT_CARD,
   new RegExp('(Amazon Gift Card|Amazon-Geschenkgutschein)')],

  [Component.ORDER_ID, util.orderIdRegExp()],

  [Component.PAYMENT_STATUS,
   new RegExp('(Pending|Completed|Charged|Berechnet|Erstattet|Ausstehend)')],

  [Component.VENDOR, new RegExp('((?:[A-Za-z][A-Za-z. ]{1,20}[A-Za-z])?)')],
]);

// This function has grown to feel sordid, and hard to understand.
// I would like instead to adopt one of the following strategies:
// 1) write BNF including replacing the regular expressions.
// 2) identify the leaf components with regex, and then BNF driven parser.
export function classifyNode(n: ClassedNode<Component>): Set<Component> {
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
      } else if (candidates.has(Component.CARD_NAME) && candidates.has(Component.BLANKED_DIGITS)) {
        candidates.delete(Component.VENDOR);
      } else {
        candidates.delete(Component.CARD_DIGITS);
      }
    }

    if (candidates.has(Component.ORDER_ID)) {
      candidates.clear();
      candidates.add(Component.ORDER_ID);
    }

    if (candidates.has(Component.DATE)) {
      candidates.clear();
      candidates.add(Component.DATE);
    }

    if (candidates.has(Component.PAYMENT_STATUS)) {
      candidates.clear();
      candidates.add(Component.PAYMENT_STATUS);
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
    countDescendants(Component.TRANSACTION) == 0 && (
      countDescendants(Component.PAYMENT_SOURCE) >= 1 ||
      countDescendants(Component.VENDOR) >= 1
    ) &&
    countDescendants(Component.DATE) >= 1 &&
    countDescendants(Component.CURRENCY_AMOUNT) == 1 &&
    countDescendants(Component.ORDER_ID) >= 1
  ) {
    possibles.add(Component.TRANSACTION);
  }

  if (
    countDescendants(Component.PAYMENT_SOURCE) == 0 &&
    countDescendants(Component.TRANSACTION) == 0 &&
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
    countDescendants(Component.CARD_DETAILS) == 0 &&
    countDescendants(Component.PAYMENT_SOURCE) == 0 &&
    countDescendants(Component.CARD_NAME) >= 1 &&
    countDescendants(Component.BLANKED_DIGITS) == 1 &&
    countDescendants(Component.CARD_DIGITS) == 1
  ) {
    possibles.add(Component.CARD_DETAILS);
    possibles.add(Component.PAYMENT_SOURCE);
  }

  if (
    countDescendants(Component.PAYMENT_SOURCE) == 0 &&
    countDescendants(Component.GIFT_CARD) == 1
  ) {
    possibles.add(Component.PAYMENT_SOURCE);
  }

  return possibles;
}

function transactionFromElement(elem: ClassedNode<Component>): Transaction {
  const unused = new Set<ClassedNode<Component>>(elem.classedDescendants);

  // Removes the matched/selected element from unused along with all of its
  // descendants, to prevent use of the same element in subsequent calls to
  // this function.
  function getValue<T>(
    n: Component,
    extractor: (es: ClassedNode<Component>[])=>T,
    defaultValue: T,
  ): T {
    const candidates = Array.from(unused.keys()).filter(c => c.components.has(n));

    for(const c of candidates) {
      unused.delete(c);

      for(const cc of c.classedDescendants) {
        unused.delete(cc);
      }
    }

    const es = candidates.sort(
      (a,b) => b.getParsedValue(n)!.length - a.getParsedValue(n)!.length);

    try {
      const result = extractor(es);
      return result;
    } catch (e) {
      if (es.length == 0) {
        // it looks like extractor isn't equipped to handle empty es.
        return defaultValue;
      }

      // Something else has gone wrong between es and extractor.
      console.warn(
        `transactionFromElement.getValue caught ${e} while working on ${n} with '${elem.text}'`);

      return defaultValue;
    }
  }

  try {
    const t = {
      orderIds: getValue(
        Component.ORDER_ID,
        ns => (ns.map(e => e.getParsedValue(Component.ORDER_ID)) as string[]),
        []
      ),

      date: getValue(
        Component.DATE,
        ns => new Date(dt.normalizeDateString(ns[0].text)),
        new Date(1970, 0, 1),
      ),

      cardInfo: getValue(
        Component.PAYMENT_SOURCE,
        ns => ns[0].text,
        ''
      ),

      amount: getValue(
        Component.CURRENCY_AMOUNT,
        ns => util.floatVal(ns[0].text),
        0,
      ),

      vendor: getValue(
        Component.VENDOR,
        ns => ns[0].text,
        ''
      ),
    };

    return t;
  } catch (ex) {
    console.warn(
      `transactionFromElement caught ${ex} while processing ${elem.text}`);
  }

  throw 'could not find Transaction in html';
}

export function extractPageOfTransactions(doc: Document): Transaction[] {
  const t = new TopologicalScrape<Component>(
    patterns,
    classifyNode,
    doc.documentElement,
  );

  const transactionElements = t.classified.filter(
    n => n.components.has(Component.TRANSACTION));

  return transactionElements.map(transactionFromElement).filter(t => t);
}

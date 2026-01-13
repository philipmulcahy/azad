/* Copyright(c) 2026 Philip Mulcahy. */

///////////////////////////////////////////////////////////////////////////////
// Use "topology" based strategy to isolate the interesting part of transaction
// pages, and then an ANTLR4 parser to parse that section into transactions.
///////////////////////////////////////////////////////////////////////////////

import * as dt from './date';
import * as util from './util';
import {Transaction} from './transaction';
import {ClassedNode, TopologicalScrape} from './topology';

// Indentation here reflects expected topology to help understand code: it has
// no significance to the actual behaviour of the code.
export enum Component {
  TRANSACTIONS_BOX = 'transactions_box',
    DATE = 'date',
    ORDER_ID = 'order_id',
    CURRENCY_AMOUNT = 'currency_amount',
    PAYMENT_SOURCE = 'payment_source',  // composite, no entry in patterns below.
      GIFT_CARD = 'gift_card',
      //  or
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
   new RegExp(
    '(Pending|In Progress|Completed|Charged|Berechnet|Erstattet|Ausstehend)')],

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

  function firstXBeforeAnyY(x: Component, y: Component): boolean {

    // returns -1 if not found
    function posFirst(c: Component): number {
      let i = 0;

      for (const cs of descendants.map(d => d.components)) {
        if (cs.has(c)) {
          return i;
        }

        ++i;
      }

      return -1;
    }

    const posX = posFirst(x);
    const posY = posFirst(y);

    if (posX != -1 && posY != -1 && posX < posY) {
      return true;
    }

    return false;
  }

  if (
    countDescendants(Component.TRANSACTIONS_BOX) == 0 &&
    countDescendants(Component.PAYMENT_STATUS) >= 1 &&
    countDescendants(Component.DATE) >= 1 &&
    countDescendants(Component.PAYMENT_SOURCE) >= 1 &&
    countDescendants(Component.CURRENCY_AMOUNT) >= 1 &&
    countDescendants(Component.ORDER_ID) >= 1 &&
    firstXBeforeAnyY(Component.PAYMENT_STATUS, Component.DATE) 
  ) {
    possibles.clear();
    possibles.add(Component.TRANSACTIONS_BOX);
  }

  return possibles;
}

export function extractPageOfTransactions(doc: Document): Transaction[] {
  const t = new TopologicalScrape<Component>(
    patterns,
    classifyNode,
    doc.documentElement,
  );

  const tss = t.classified.filter(c => c.components.has(Component.TRANSACTIONS_BOX));
  tss.map(ts => console.log(ts.linesString));
  return [];
}

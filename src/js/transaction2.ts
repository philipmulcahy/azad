/* Copyright(c) 2026 Philip Mulcahy. */

///////////////////////////////////////////////////////////////////////////////
// Use "topology" based strategy to isolate the interesting part of transaction
// pages, and then an ANTLR4 parser to parse that section into transactions.
///////////////////////////////////////////////////////////////////////////////

import * as dt from './date';
import * as util from './util';
import {Transaction} from './transaction';
import {ClassedNode, TopologicalScrape} from './topology';

import {BailErrorStrategy, CharStream, CommonTokenStream} from 'antlr4';
import transactionLexer from '../generated/transactionLexer';
import transactionParser, { Status_transaction_groupContext, Dated_transactionsContext, Dateless_transactionContext } from '../generated/transactionParser';
import transactionVisitor from '../generated/transactionVisitor';

// Indentation here reflects expected topology to help understand code: it has
// no significance to the actual behaviour of the code.
export enum Component {
  TRANSACTIONS_BOX = 'transactions_box',
    PAYMENT_STATUS = 'payment_status',
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
      VENDOR = 'vendor',
}

const statusStrings = [
  'In Progress',
  'Completed',
  'Pending',
  'Completed',
  'Charged',
  'Berechnet',
  'Erstattet',
  'Ausstehend',
];

const alternatedStatus = new RegExp(
  `(${statusStrings.join('|')})`,
  'i',
);

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
  [Component.PAYMENT_STATUS, alternatedStatus],
  [Component.VENDOR, new RegExp('((?:[A-Za-z][A-Za-z. ]{1,20}[A-Za-z])?)')],
]);

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

export class TransactionMapper extends transactionVisitor<void> {
  private transactions: Transaction[] = [];
  private currentStatus: string = "";
  private currentDate: Date = new Date();

  public mapAll(tree: Status_transaction_groupContext): Transaction[] {
    this.visit(tree);
    return this.transactions;
  };

  override visitStatus_transaction_group = (ctx: Status_transaction_groupContext): void => {
    this.currentStatus = ctx.status().getText();
    this.visitChildren(ctx);
  };

  override visitDated_transactions = (ctx: Dated_transactionsContext): void => {
    const d = ctx.date();
    const dateStr = `${d.MONTH().getText()} ${d.DAY_OF_MONTH().getText()}, ${d.year().getText()}`;

    // Convert the string components into a real Date object
    this.currentDate = new Date(dateStr);

    this.visitChildren(ctx);
  };

  override visitDateless_transaction = (ctx: Dateless_transactionContext): void => {
    const payCtx = ctx.payment_source_and_amount();

    // 1. Convert Amount: Strip everything except digits, decimal, and minus sign
    const rawAmount = payCtx.CURRENCY_AMOUNT().getText();
    const numericAmount = parseFloat(rawAmount.replace(/[^\d.-]/g, ''));

    // 2. Format Card Info
    const cardInfo = `${payCtx.card_issuer().getText()} **** ${payCtx.card_digits().getText()}`;

    // 3. Extract ALL Order IDs
    // Because we used '+' in the grammar, ctx.ORDER_ID() returns an array
    const allOrderIds = ctx.ORDER_ID_list().map(idNode => idNode.getText());

    const transaction: Transaction = {
        date: this.currentDate,
        cardInfo: cardInfo,
        orderIds: allOrderIds,
        amount: numericAmount,
        vendor: ctx.vendor().getText()
    };

    this.transactions.push(transaction);
  };
}

function parseTransactionBlock(text: string): Transaction[] {
  try {
    const inputStream = new CharStream(text);
    const lexerInstance = new transactionLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexerInstance);
    const parserInstance = new transactionParser(tokenStream);

    // 1. SILENCE: Remove the default listeners that print to console.error
    // This stops the "line X:Y recognition error" messages.
    lexerInstance.removeErrorListeners();
    parserInstance.removeErrorListeners();

    // 2. BAIL: Stop at the first error instead of trying to "recover"
    // The default strategy is what generates "extraneous input" logs.
    // BailErrorStrategy throws a ParseCancellationException and STOPS.
    parserInstance._errHandler = new BailErrorStrategy();

    const tree = parserInstance.status_transaction_group();
    const visitorInstance = new TransactionMapper();
    return visitorInstance.mapAll(tree);

  } catch (error) {
    // 3. DISCARD: We catch the ParseCancellationException here.
    // We return [] silently, letting the strategy runner move on.
    return [];
  }
}

export function extractPageOfTransactions(doc: Document): Transaction[] {
  const t = new TopologicalScrape<Component>(
    patterns,
    classifyNode,
    doc.documentElement,
  );

  const tss = t.classified.filter(
    c => c.components.has(Component.TRANSACTIONS_BOX)
  );

  function viabilityPredicate(s: string): boolean {
    const match = new RegExp(
      `^\\s*(${alternatedStatus.source})\\s`,
      'i'
    ).exec(s);

    if (match) {
      return true;
    }

    return false;
  }

  const tsStrings: string[] = tss
    .map(ts => ts.linesString)
    .filter(viabilityPredicate);

  if (tsStrings.length == 0) {
    console.log('no viable transaction blocks found to parse');
    return [];
  }

  const transactions = tsStrings.flatMap(parseTransactionBlock);
  return transactions;
}

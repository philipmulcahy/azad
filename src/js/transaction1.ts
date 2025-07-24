/* Copyright(c) 2025 Philip Mulcahy. */

import * as dt from './date';
import * as util from './util';
import {Transaction} from './transaction';


export enum ComponentName {
  TRANSACTION = 'transaction',  // composite, no entry in patterns below.
    CURRENCY_AMOUNT = 'currency_amount',
    DATE = 'date',
    ORDER_ID = 'order_id',
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

export const patterns = new Map<ComponentName, RegExp>([
  [ComponentName.BLANKED_DIGITS, new RegExp('([•*]{3,4})')],
  [ComponentName.CARD_DIGITS, new RegExp('([0-9]{3,4})')],
  [ComponentName.CARD_NAME, new RegExp('([A-Za-z][A-Za-z0-9. ]{2,49})')],

  [ComponentName.CURRENCY_AMOUNT,
    new RegExp(`(-? *${util.currencyRegex().source} *\\d[0-9,.]*)`)],

  [ComponentName.DATE, new RegExp(`(${dt.getDateRegex().source})`)],

  [ComponentName.GIFT_CARD,
   new RegExp('(Amazon Gift Card|Amazon-Geschenkgutschein)')],

  [ComponentName.ORDER_ID, util.orderIdRegExp()],

  [ComponentName.PAYMENT_STATUS,
   new RegExp('(Pending|Charged|Berechnet|Erstattet|Ausstehend)')],

  [ComponentName.VENDOR, new RegExp(
    '((?:[A-Za-z][A-Za-z. ]{1,20}[A-Za-z])?)')],
]);

// This function has grown to feel sordid, and hard to understand.
// I would like instead to adopt one of the following strategies:
// 1) write BNF including replacing the regular expressions.
// 2) identify the leaf components with regex, and then BNF driven parser.
function classifyNode(n: ClassedNode): Set<ComponentName> {
  if (n.isNonScriptText) {
    const candidates = new Set<ComponentName>(
      [...patterns.keys()].filter(p => match(p, n) != null));

    if (candidates.has(ComponentName.CARD_DIGITS)) {
        if (n.hasSiblingToLeft(
          s => s.components.has(ComponentName.BLANKED_DIGITS)
        )) {
          candidates.clear();
          candidates.add(ComponentName.CARD_DIGITS);
        } else {
          candidates.delete(ComponentName.CARD_DIGITS);
        }
    }

    if (candidates.has(ComponentName.ORDER_ID)) {
      candidates.clear();
      candidates.add(ComponentName.ORDER_ID);
    }

    if (candidates.has(ComponentName.DATE)) {
      candidates.clear();
      candidates.add(ComponentName.DATE);
    }

    if (candidates.has(ComponentName.PAYMENT_STATUS)) {
      candidates.clear();
      candidates.add(ComponentName.PAYMENT_STATUS);
    }

    return candidates;
  }

  const possibles: Set<ComponentName> = new Set<ComponentName>();

  const descendants = n.classedDescendants;

  function countDescendants(cn: ComponentName): number {
    return descendants.filter(d => d.components.has(cn)).length;
  }

  if (
      countDescendants(ComponentName.TRANSACTION) == 0 && (
        countDescendants(ComponentName.PAYMENT_SOURCE) >= 1 ||
        countDescendants(ComponentName.VENDOR) >= 1
      ) &&
      countDescendants(ComponentName.DATE) >= 1 &&
      countDescendants(ComponentName.CURRENCY_AMOUNT) == 1 &&
      countDescendants(ComponentName.ORDER_ID) >= 1
  ) {
    possibles.add(ComponentName.TRANSACTION);
  }

  if (
    countDescendants(ComponentName.PAYMENT_SOURCE) == 0 &&
    countDescendants(ComponentName.TRANSACTION) == 0 &&
    (
      (
        countDescendants(ComponentName.CARD_DETAILS) == 1 &&
        countDescendants(ComponentName.GIFT_CARD) == 0
      ) || (
        countDescendants(ComponentName.CARD_DETAILS) == 0 &&
        countDescendants(ComponentName.GIFT_CARD) == 1
      )
    )
  ) {
    possibles.add(ComponentName.PAYMENT_SOURCE);
  }

  if (
      countDescendants(ComponentName.CARD_DETAILS) == 0 &&
      countDescendants(ComponentName.PAYMENT_SOURCE) == 0 &&
      countDescendants(ComponentName.CARD_NAME) >= 1 &&
      countDescendants(ComponentName.BLANKED_DIGITS) == 1 &&
      countDescendants(ComponentName.CARD_DIGITS) == 1
  ) {
    possibles.add(ComponentName.CARD_DETAILS);
    possibles.add(ComponentName.PAYMENT_SOURCE);
  }

  if (
      countDescendants(ComponentName.PAYMENT_SOURCE) == 0 &&
      countDescendants(ComponentName.GIFT_CARD) == 1
  ) {
    possibles.add(ComponentName.PAYMENT_SOURCE);
  }

  return possibles;
}

function match(pattern: ComponentName, elem: ClassedNode): string | null {
  if (!patterns.has(pattern)) {
    return null;
  }

  const re: RegExp = patterns.get(pattern)!;
  const text = elem.directText;

  if(!text) {
    return null;
  }

  const m = text.match(re);

  if (m == null) {
    return null;
  }

  return m[1];
}

export class ClassedNode {
  _element: HTMLElement;
  _possibleComponents = new Map<ComponentName, string|null>();
  _descendants: ClassedNode[] = [];

  static _elementMap = new Map<Node, ClassedNode>();

  // Use create(...) instead
  private constructor(n: HTMLElement) {
    if (n.nodeName == '#text') {
      throw new Error('#text nodes are not elements');
    }

    this._element = n;

    for (const child of this.children) {
      if (child.components.size > 0) {
        this._descendants.push(child);
      }

      for (const d of child.classedDescendants) {
        this._descendants.push(d);
      }
    }

    for (const name of classifyNode(this)) {
      if (patterns.has(name)) {
        const parsedValue = match(name, this);
        this._possibleComponents.set(name, parsedValue);
      } else {
        this._possibleComponents.set(name, null);
      }
    }

    ClassedNode._elementMap.set(n, this);
  }

  // Prevent duplicate ClassedNode objects for the same Node object
  static create(n: HTMLElement): ClassedNode {
    if (n == null || typeof(n) == 'undefined') {
      throw new Error('cannot make a ClassedNode from a null or undefined element');
    }

    if (ClassedNode._elementMap.has(n)) {
      return ClassedNode._elementMap.get(n)!;
    }

    return new ClassedNode(n);
  }

  get classedDescendants(): ClassedNode[] {
    if (!Array.isArray(this._descendants)) {
      console.error(`not an array, but should be: ${this._descendants}`);
    }

    return [...this._descendants];
  }

  get children(): ClassedNode[] {
    return Array.from(this.element.children)
                .filter(c => c.textContent)
                .map(c => ClassedNode.create(c as HTMLElement));
  }

  get components(): Set<ComponentName> {
    return new Set(this._possibleComponents.keys());
  }

  get element(): HTMLElement {
    return this._element;
  }

  get parent(): ClassedNode {
    return ClassedNode.create(this.element.parentElement!);
  }

  getParsedValue(component: ComponentName): string | null {
    return patterns.has(component) ?
      this._possibleComponents.get(component) ?? null:
      this.text;
  }

  get directText(): string {
    return [...this.element.childNodes]
     .filter(n => n.nodeName.toLowerCase() == '#text')
     .map(n => n.textContent)
     .join('')
     .replace(/\s+/g, ' ')
     .trim();
  }

  get text(): string {
    return this.element.textContent ?? '';
  }

  get isNonScriptText(): boolean {
    if (this.directText == '') {
      return false;
    }

    if (['script', 'style'].includes(this.type.toLowerCase())) {
      return false;
    }

    return true;
  }

  // #text, div, span, etc.
  get type(): string {
    return this._element.nodeName;
  }

  hasSiblingToLeft(predicate: (sibling: ClassedNode) => boolean) {
    let s = this.left;

    while (s != null) {
      if (predicate(s)) {
        return true;
      }

      s = s.left;
    }

    return false;
  }

  get left(): ClassedNode | null {
    let s = this.element.previousSibling;

    while (s != null && s.nodeName.toLowerCase() == '#text') {
      s = s.previousSibling;
    }

    return s != null ?
      ClassedNode.create(s as HTMLElement) :
      null;
  }

  toString(): string {
    return `ClassedNode(${[...this.components].join('|')}, ` +
           `descendants:${this.classedDescendants.join('|')}, ` +
           `${this.directText == '' ? this.type : this.directText})`;
  }

}

function transactionFromElement(elem: ClassedNode): Transaction {
  const unused = new Set<ClassedNode>(elem.classedDescendants);

  // Removes the matched/selected element from unused along with all of its
  // descendants, to prevent use of the same element in subsequent calls to
  // this function.
  function getValue<T>(
    n: ComponentName,
    extractor: (es: ClassedNode[])=>T,
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
        ComponentName.ORDER_ID,
        ns => (ns.map(e => e.getParsedValue(ComponentName.ORDER_ID)) as string[]),
        []
      ),

      date: getValue(
        ComponentName.DATE,
        ns => new Date(dt.normalizeDateString(ns[0].text)),
        new Date(1970, 0, 1),
      ),

      cardInfo: getValue(
        ComponentName.PAYMENT_SOURCE,
        ns => ns[0].text,
        ''
      ),

      amount: getValue(
        ComponentName.CURRENCY_AMOUNT,
        ns => util.floatVal(ns[0].text),
        0,
      ),

      vendor: getValue(
        ComponentName.VENDOR,
        ns => ns[0].text,
        ''
      ),
    };

    console.debug('transactionFromElement returning', t);
    return t;
  } catch (ex) {
    console.warn(
      `transactionFromElement caught ${ex} while processing ${elem.text}`);
  }

  throw 'could not find Transaction in html';
}

export function extractPageOfTransactions(doc: Document): Transaction[] {
  const rootClassified = ClassedNode.create(doc.documentElement);

  const transactionElements = rootClassified.classedDescendants.filter(
    e => e.components.has(ComponentName.TRANSACTION)
  );

  return transactionElements.map(e => transactionFromElement(e))
                            .filter(t => t);
}

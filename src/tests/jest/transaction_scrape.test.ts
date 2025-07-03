import {extractPageOfTransactions, Transaction} from '../../js/transaction';
import * as fs from 'fs';
import * as dt from '../../js/date';
import * as util from '../../js/util';

const jsdom = require('jsdom');

function scrapePageOfTransactionsFromCannedHtml(htmlFilePath: string): Transaction[] {
  const html: string = fs.readFileSync(htmlFilePath, 'utf8');
  const doc = new jsdom.JSDOM(html).window.document;
  return extractPageOfTransactions(doc);
}

describe('can read 20 transactions', () => {
  test(
    'philipmulcahy', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/philipmulcahy/2025-06-08.html');

      expect(transactions.length).toEqual(20);
  });

  test(
    'DReffects', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/DReffects/2025-06-08.html');

      expect(transactions.length).toEqual(20);
  });

  test(
    'cmulcahy', () => {
      const transactions = scrapePageOfTransactionsFromCannedHtml(
        './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html');

      expect(transactions.length).toEqual(20);
  });
});

//TODO remove everything below this line (and this line) - it's experimental.

enum ComponentName {
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

const patterns = new Map<ComponentName, RegExp>([
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

class ClassedNode {
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
      this._possibleComponents.get(component) :
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
        (a,b) => b.getParsedValue(n).length - a.getParsedValue(n).length);

    try {
        const result = extractor(es);
        return result;
    } catch (e) {
        console.warn(
          `transactionFromElement.getValue caught ${e} while working on ${n} with '${elem.text}'`);

        return defaultValue;
    }
  }

  try {
    const t = {
      orderIds: getValue(
        ComponentName.ORDER_ID,
        ns => ns.map(e => e.getParsedValue(ComponentName.ORDER_ID)),
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

    return t;
  } catch (ex) {
    console.warn(
      `transactionFromElement caught ${ex} while processing ${elem.text}`);
  }
  return null;
}

function extractTransactions(doc: Document): Transaction[] {
  const rootClassified = ClassedNode.create(doc.documentElement);

  const transactionElements = rootClassified.classedDescendants.filter(
    e => e.components.has(ComponentName.TRANSACTION)
  );

  return transactionElements.map(e => transactionFromElement(e))
                            .filter(t => t);
}

///////////////////////////////////////////////////////////////////////////////

describe(
  'transaction date regex',
  () => {

    function verifyDateExtraction(dateString: string) {
      const re = patterns.get(ComponentName.DATE)!;
      const match = dateString.match(re);
      expect(match).not.toBeNull;
      expect(match![0]).toEqual(dateString);
    }

    test(
      'amazon.co.uk',
      () => {
        verifyDateExtraction('09 Jun 2025');
        verifyDateExtraction('07 Feb 2005');
      }
    );

    test(
      'amazon.de',
      () => {
        verifyDateExtraction('04. Juni 2025');
        verifyDateExtraction('08. Mai 2025');
      }
    );
  }
);

test(
  'transaction card digits regex',
  () => {
    const p = patterns.get(ComponentName.CARD_DIGITS)!;
    expect('1234'.match(p)).not.toBeNull();
    expect('a234'.match(p)).toBeNull();
    expect('123d'.match(p)).toBeNull();
  }
);

test(
  'transaction blanked card digits regex',
  () => {
    const p = patterns.get(ComponentName.BLANKED_DIGITS)!;
    expect('••••'.match(p)).not.toBeNull();
    expect('1234'.match(p)).toBeNull();
    expect('abcd'.match(p)).toBeNull();
  }
);

test(
  'transaction page graph experiment amazon.co.uk',
  () => {
    const htmlFilePath =
      './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html';

    const html: string = fs.readFileSync(htmlFilePath, 'utf8');
    const doc: Document = new jsdom.JSDOM(html).window.document;
    const rootClassified = ClassedNode.create(doc.documentElement);

    function countType(name: ComponentName): number {
      return rootClassified.classedDescendants.filter(
        d => d.components.has(name)
      ).length;
    }

    expect(countType(ComponentName.ORDER_ID)).toEqual(22);
    expect(countType(ComponentName.GIFT_CARD)).toEqual(1);
    expect(countType(ComponentName.CARD_DETAILS)).toEqual(19);
    expect(countType(ComponentName.PAYMENT_SOURCE)).toEqual(20);
    expect(countType(ComponentName.TRANSACTION)).toEqual(20);

    const transactions = extractTransactions(doc);

    console.log(transactions);
  }
);

type Difference = string;

function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size == b.size && [...a].every(value => b.has(value));
}

function compareTransactions(a: Transaction, b: Transaction): Difference[] {
  const differences: Difference[] = [];
  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(a));
  const commonKeys = new Set<string>();

  for (const k of aKeys) {
    commonKeys.add(k);
  }

  for (const k of bKeys) {
    commonKeys.add(k);
  }

  if (!setsAreEqual(aKeys, bKeys)) {
    for (const k of aKeys) {
      if (!bKeys.has(k)) {
        differences.push(`b missing key: ${k}`);
      }
    }

    for (const k of bKeys) {
      if (!aKeys.has(k)) {
        differences.push(`a missing key: ${k}`);
      }
    }
  }

  if (a.orderIds.includes('303-9219989-6909129') && a.amount == -9.98 &&
      b.orderIds.includes('303-9219989-6909129') && b.amount == -9.98) {
    console.log('oohlala');
  }

  for (const k of commonKeys) {
    const aVal = JSON.stringify((a as Record<string, any>)[k]);
    const bVal = JSON.stringify((b as Record<string, any>)[k]);

    if (aVal !== bVal) {
      differences.push(`different values for ${k}: ${aVal} vs ${bVal}`);
    }
  }

  return differences;
}

function compareLists(a: Transaction[], b: Transaction[]): Difference[] {
  const differences: Difference[] = [];

  for (const l of a) {
    if (!b.some(r => compareTransactions(l, r).length == 0)) {
      differences.push(`b does not contain ${JSON.stringify(l)}`);
    }
  }

  for (const r of b) {
    if (!a.some(l => compareTransactions(l, r).length == 0)) {
      differences.push(`a does not contain ${JSON.stringify(r)}`);
    }
  }

  return differences;
}

test(
  'transaction page graph experiment amazon.de',
  () => {

    const pathStem = './src/tests/azad_test_data/transactions/DReffects/2025-06-08';
    const htmlPath = pathStem + '.html';
    const jsonPath = pathStem + '.expected.json';

    const html: string = fs.readFileSync(htmlPath, 'utf8');
    const doc: Document = new jsdom.JSDOM(html).window.document;
    const expected = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Transaction[];
    expected.forEach(t => t.date = new Date(t.date));
    const rootClassified = ClassedNode.create(doc.documentElement);

    function countType(name: ComponentName): number {
      return rootClassified.classedDescendants.filter(
        d => d.components.has(name)
      ).length;
    }

    const transactions = extractTransactions(doc);
    console.log(transactions);
    const achievedOrderIds = new Map<string, number>();

    for(const t of transactions) {
      for(const id of t.orderIds) {
        const previous = achievedOrderIds.get(id) ?? 0;
        achievedOrderIds.set(id, previous+1);
      }
    }

    expect(countType(ComponentName.TRANSACTION)).toEqual(40);
    const differences = compareLists(transactions, expected);
    console.log('differences...');
    console.log(differences);
    expect(differences.length).toEqual(0);
  }
);

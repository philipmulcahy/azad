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
  if (
    // n.text.length < 250 &&
    // n.text.match('07 Jun.*204.440.*56.57.*Charged')
    (n.text.length ?? 0) < 500 &&
    n.text.match('.*303-9504388-9109144.*54.28.*')
  ) {
    console.log('oohlala');
  }

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

    if (!['script', 'style'].includes(this.type.toLowerCase()) && this.directText != '') {
      console.log(
        `'${this.directText}' -> ` +
        `${Array.from(this._possibleComponents.keys()).join(',')}`
      );
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
  console.log(unused);

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
          `transactionFromElement.getValue caught ${e} while working on ${n}`);

        return defaultValue;
    }
  }

  if (
    // n.text.length < 250 &&
    // n.text.match('07 Jun.*204.440.*56.57.*Charged')
    (elem.text.length ?? 0) < 250 &&
    elem.text.match('.*303-9504388-9109144.*54.28.*')
  ) {
    console.log('oohlalala!');
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

test(
  'transaction page graph experiment amazon.de',
  () => {
    const htmlFilePath =
      './src/tests/azad_test_data/transactions/DReffects/2025-06-08.html';

    const html: string = fs.readFileSync(htmlFilePath, 'utf8');
    const doc: Document = new jsdom.JSDOM(html).window.document;
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

    console.log('achieved...');
    console.log(achievedOrderIds);

    const expectedOrderIds = new Map<string, number>([
      ['028-0347503-0632369', 3],
      ['028-1782804-2661112', 1],
      ['028-7335899-8388334', 1],
      ['028-7566725-4072366', 1],
      ['028-8924859-6127537', 2],
      ['303-0233043-3185956', 3],
      ['303-1232532-5892333', 2],
      ['303-1432747-6689942', 2],
      ['303-5261226-7761122', 3],
      ['303-5561464-9593924', 1],
      ['303-5628131-5481139', 3],
      ['303-6646448-9495500', 1],
      ['303-7953008-1837928', 1],
      ['303-8126600-9781933', 2],
      ['303-8296591-5429143', 3],
      ['303-8535828-5837111', 1],
      ['303-9219989-6909129', 2],
      ['303-9504388-9109144', 3],
      ['303-9573289-1968353', 2],
      ['303-9940709-9305945', 1],
      ['305-0908297-8514738', 1],
      ['305-5646626-2045901', 1],
    ]);

    const missingOrderIds = new Map<string, number>();
    
    for(const id of expectedOrderIds.keys()) {
      const expected = expectedOrderIds.get(id);
      const achieved = achievedOrderIds.get(id) ?? 0;
      const deficit = expected - achieved;
      if (deficit) {
        missingOrderIds.set(id, deficit);
      }
    }

    console.log('missing...');
    console.log(missingOrderIds);

    expect(missingOrderIds.size).toEqual(0);
    expect(countType(ComponentName.TRANSACTION)).toEqual(40);
  }
);

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
  TRANSACTION = 'transaction',  // composite, so no entry in patterns below.
  CARD_DETAILS = 'card_details',  // composite, so no entry in patterns below.
  ORDER_ID = 'order_id',
  DATE = 'date',
  BLANKED_DIGITS = 'blanked_digits',
  CARD_DIGITS = 'card_digits',
  CARD_NAME = 'card_name',
  CURRENCY_AMOUNT = 'currency_amount',
  PAYMENT_STATUS = 'payment_status',
  NONE = 'none',
}

const patterns = new Map<ComponentName, RegExp>([
  [ComponentName.ORDER_ID, util.orderIdRegExp()],
  [ComponentName.DATE, new RegExp(`(${dt.getDateRegex().source})`)],
  [ComponentName.BLANKED_DIGITS, new RegExp('(••••|[*][*][*][*])')],
  [ComponentName.CARD_DIGITS, new RegExp('(\\d\\d\\d\\d)')],
  [ComponentName.CARD_NAME, new RegExp('([A-Za-z][A-Za-z0-9]{2,24})')],
  [ComponentName.CURRENCY_AMOUNT,
    new RegExp(`(-? *${util.currencyRegex().source} *\\d[0-9,.]*)`)],
  [ComponentName.PAYMENT_STATUS,
    new RegExp('(Pending|Charged|Berechnet|Erstattet|Ausstehend)')],
]);

function nodePath(node: Node): string[] {
  const path: string[] = [node.nodeName];

  while (node.parentNode) {
    node = node.parentNode;
    path.push(node.nodeName);
  }

  return path;
}

function textNodesUnder(e: HTMLElement): Node[] {
  const children: Node[] = [];
  const walker = e.ownerDocument?.createTreeWalker(
    e,
    4,  // NodeFilter.SHOW_TEXT apparently not available in node.js
  );

  while(walker?.nextNode()) {
    children.push(walker.currentNode);
  }

  return children;
}

function elementsOwningTextNodes(textNodes: Node[]): HTMLElement[] {
  const results = new Set<HTMLElement>(textNodes.map(t => t.parentElement!));
  return [...results];
}

function classifyNode(n: ClassedNode): Set<ComponentName> {
  if (
    // n.text.length < 250 &&
    // n.text.match('07 Jun.*204.440.*56.57.*Charged')
    (n.element.textContent?.length ?? 0) < 50 &&
    n.element.textContent?.match('AmericanExpress••••1005')
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

    // if (candidates.has(ComponentName.CARD_NAME)) {

    //   if (n.hasSiblingToRight(
    //       s => s.components.has(ComponentName.BLANKED_DIGITS))
    //   ) {
    //     return new Set<ComponentName>([ComponentName.CARD_NAME]);
    //   }

    //   return  new Set<ComponentName>(); 
    // }

    return candidates;
  }

  const possibles: Set<ComponentName> = new Set<ComponentName>();

  const descendants = n.classedDescendants;

  function countDescendants(cn: ComponentName): number {
    return descendants.filter(d => d.components.has(cn)).length;
  }

  if (
      countDescendants(ComponentName.TRANSACTION) == 0 &&
      countDescendants(ComponentName.CARD_DETAILS) == 1 &&
      countDescendants(ComponentName.DATE) >= 1 &&
      countDescendants(ComponentName.CURRENCY_AMOUNT) == 1 &&
      countDescendants(ComponentName.ORDER_ID) >= 1
  ) {
    possibles.add(ComponentName.TRANSACTION);
  }

  if (
      countDescendants(ComponentName.CARD_DETAILS) == 0 &&
      countDescendants(ComponentName.CARD_NAME) >= 1 &&
      countDescendants(ComponentName.BLANKED_DIGITS) == 1 &&
      countDescendants(ComponentName.CARD_DIGITS) == 1 
  ) {
    possibles.add(ComponentName.CARD_DETAILS);
  }

  return possibles;
}

function nodeDepth(n: Node): number {
  const root = n.ownerDocument!.body;
  let d = 0;

  while (n != null && n !== root) {
    n = n.parentNode!;    
    d++;
  }

  return d;
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
  _depth: number;
  _descendants: ClassedNode[] = [];

  static _elementMap = new Map<Node, ClassedNode>();
  
  // Use create(...) instead
  private constructor(n: HTMLElement) {
    if (n.nodeName == '#text') {
      throw new Error('#text nodes are not elements');
    }

    this._element = n;
    this._depth = nodeDepth(n);

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

  get depth(): number {
    return this._depth;
  }

  get element(): HTMLElement {
    return this._element;  
  }

  get parent(): ClassedNode {
    return ClassedNode.create(this.element.parentElement!);
  }

  getParsedValue(component: ComponentName): string | null {
    return this._possibleComponents.get(component) ?? null;
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

  searchUpwardsForTransaction(): ClassedNode|null {
    let pivot: ClassedNode = this;
    const root = this.element.ownerDocument!.body;

    while (pivot.element != root && this.depth - pivot.depth < 10) {
      if (pivot.components.has(ComponentName.TRANSACTION)) {
        return pivot;
      }

      pivot = pivot.parent;
    }

    return pivot;
  }

  toString(): string {
    return `ClassedNode(${[...this.components].join('|')}, ` +
           `depth:${this.depth}, ` +
           `descendants:${this.classedDescendants.join('|')}, ` +
           `${this.directText == '' ? this.type : this.directText})`;
  }

}

test(
  'transaction page graph experiment',
  () => {
    const htmlFilePath =
      './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html';

    const html: string = fs.readFileSync(htmlFilePath, 'utf8');
    const doc = new jsdom.JSDOM(html).window.document;
    const rootClassified = ClassedNode.create(doc.documentElement);

    const conciseTextNodes = textNodesUnder(doc.documentElement).filter(
      node => node.textContent?.length ?? 0 < 500
    );

    const textElements = elementsOwningTextNodes(conciseTextNodes);

    expect(textElements.length).toBeGreaterThan(100);
    const classedElements = textElements.map(n => ClassedNode.create(n));

    for (const component of patterns.keys()) {
      const nodes = classedElements.filter(nc => nc.components.has(component));
      console.log(`component: ${component} ${nodes.length} ${nodes.join(', ')}`);
      expect(nodes.length).toBeGreaterThanOrEqual(15);
    }

    const idNode = classedElements.filter(
      n => n.getParsedValue(ComponentName.ORDER_ID) == '204-7501111-7892320'
    )[0]!;

    console.log('idNode:', idNode.toString());

    const ggParent = idNode.parent.parent.parent;
    console.log('ggParent:', ggParent.toString());

    const orderIdElems = classedElements.filter(
      e => e.components.has(ComponentName.ORDER_ID));

    expect(orderIdElems.length).toEqual(21);

    const transactionElems = classedElements.filter(
      e => e.components.has(ComponentName.TRANSACTION));

    const transactionElems2 = rootClassified.classedDescendants.filter(
      d => d.components.has(ComponentName.TRANSACTION));

    console.log('transaction text:\n' + transactionElems2.map(te => te.text).join('\n'));
    expect(transactionElems2.length).toEqual(20);
  }
);

test(
  'transaction date regex',
  () => {
    const goodDate = '09 Jun 2025';
    const re = patterns.get(ComponentName.DATE)!;
    console.log(re.source!);
    const match = goodDate.match(re);
    console.log(match);
    expect(match).not.toBeNull;
    expect(match![0]).toEqual(goodDate);

    const anotherGoodDate = '07 Feb 2005';
    expect(anotherGoodDate.match(re)).not.toBeNull;
    expect(anotherGoodDate.match(re)![0]).toEqual(anotherGoodDate);
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

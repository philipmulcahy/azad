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
  NONE = 'none',
}

const patterns = new Map<ComponentName, RegExp>([
  [ComponentName.ORDER_ID, util.orderIdRegExp()],
  [ComponentName.DATE, new RegExp(`(${dt.getDateRegex().source})`)],
  [ComponentName.BLANKED_DIGITS, new RegExp('••••|[*][*][*][*]')],
  [ComponentName.CARD_DIGITS, new RegExp('(\d\d\d\d)')],
  [ComponentName.CARD_NAME, new RegExp('([A-Za-z][A-Za-z0-9]{2,24})')],
  [ComponentName.CURRENCY_AMOUNT,
    new RegExp(`(-? *${util.currencyRegex().source} *\d[0-9,.]*)`)],
]);

function match(pattern: ComponentName, node: Node): string | null {
  if (!patterns.has(pattern)) {
    return null;
  }

  const re: RegExp = patterns.get(pattern)!;

  if(!node.textContent) {
    return null;
  }

  const m = node.textContent.match(re);

  if (m == null) {
    return null;
  }

  return m[1];
}

function nodePath(node: Node): string[] {
  const path: string[] = [node.nodeName];

  while (node.parentNode) {
    node = node.parentNode;
    path.push(node.nodeName);
  }

  return path;
}

function textNodesUnder(n: Node): Node[] {
  const children: Node[] = [];
  const walker = n.ownerDocument?.createTreeWalker(
    n,
    4,  // NodeFilter.SHOW_TEXT apparently not available in node.js
  );

  while(walker?.nextNode()) {
    children.push(walker.currentNode);
  }

  return children;
}

function classifyTextNode(n: Node): ComponentName {
  if (n.textContent == '09 Jun 2025') {
    console.log('honey, I\'m home!');
  }

  for (
    const p of [...patterns.keys()].filter(p => p != ComponentName.NONE)
  ) {
    const m = match(p, n);

    if (m != null) {
      return p;
    }
  }

  return ComponentName.NONE;
}

function classifyNode(n: ClassedNode): ComponentName {
  if (n.type == '#text') {
    return classifyTextNode(n.node);
  }

  const descendants = n.classedDescendants;

  function countDescendants(cn: ComponentName): number {
    return descendants.filter(d => d.component == cn).length;
  }

  if (countDescendants(ComponentName.CARD_DETAILS) == 1 &&
      countDescendants(ComponentName.DATE) >= 1 &&
      countDescendants(ComponentName.CURRENCY_AMOUNT) == 1 &&
      countDescendants(ComponentName.ORDER_ID) >= 1
  ) {
    return ComponentName.TRANSACTION;
  }

  if (countDescendants(ComponentName.CARD_NAME) == 1 &&
      countDescendants(ComponentName.BLANKED_DIGITS) == 1 &&
      countDescendants(ComponentName.CARD_DIGITS) == 1 
  ) {
    return ComponentName.CARD_DETAILS;
  }

  return ComponentName.NONE;
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

class ClassedNode {
  _node: Node;
  _component: ComponentName;
  _parsedValue: string;
  _depth: number;
  _descendants: ClassedNode[];

  static _nodeMap = new Map<Node, ClassedNode>();
  
  // Use create(...) instead
  private constructor(n: Node) {
    this._node = n;
    this._depth = nodeDepth(n);


    this._descendants = [];

    for (const childNode of n.childNodes) {
      
      const classedChild = ClassedNode.create(childNode);

      if (classedChild.component != ComponentName.NONE) {
        this._descendants.push(classedChild);
      }

      for (const d of classedChild.classedDescendants) {
        this._descendants.push(d);
      }
    }

    this._component = classifyNode(this);

    this._parsedValue =
      patterns.has(this._component) ?
      match(this._component, this._node) ?? '' :
      '';

    ClassedNode._nodeMap.set(n, this);
  }

  // Prevent duplicate ClassedNode objects for the same Node object
  static create(n: Node): ClassedNode {
    if (ClassedNode._nodeMap.has(n)) {
      return ClassedNode._nodeMap.get(n)!;
    }
    
    return new ClassedNode(n);
  }

  get classedDescendants(): ClassedNode[] {
    if (!Array.isArray(this._descendants)) {
      console.error(`not an array, but should be: ${this._descendants}`);
    }

    return [...this._descendants];
  }

  get component(): ComponentName {
    return this._component;
  }

  get depth(): number {
    return this._depth;
  }

  get node(): Node {
    return this._node;  
  }

  get parent(): ClassedNode {
    return ClassedNode.create(this.node.parentNode!);
  }

  get parsedValue(): string {
    return this._parsedValue;
  }

  toString(): string {
    return `ClassedNode(${this.component}, depth:${this.depth}, ` +
           `descendants:${this.classedDescendants.length} ${this.parsedValue})`;
  }

  // #text, div, span, etc.
  get type(): string {
    return this._node.nodeName;
  }

  searchUpForTransaction(): ClassedNode|null {
    let pivot: ClassedNode = this;
    const root = this.node.ownerDocument!.body; 

    while (pivot.node != root && this.depth - pivot.depth < 10) {
      if (pivot.component == ComponentName.TRANSACTION) {
        return pivot;
      }

      pivot = pivot.parent;
    }

    return pivot;
  }
}

test(
  'transaction page graph experiment',
  () => {
    const htmlFilePath =
      './src/tests/azad_test_data/transactions/cmulcahy/2025-06-09.html';

    const html: string = fs.readFileSync(htmlFilePath, 'utf8');
    const doc = new jsdom.JSDOM(html).window.document;

    const conciseTextNodes = textNodesUnder(doc.documentElement).filter(
      node => node.textContent?.length ?? 0 < 500
    );

    expect(conciseTextNodes.length).toBeGreaterThan(100);
    const classedTextNodes = conciseTextNodes.map(n => ClassedNode.create(n));

    for (const component of patterns.keys()) {
      const nodes = classedTextNodes.filter(nc => nc.component == component);
      console.log(`${component}: ${nodes.join(', ')}`);
    }

    const idNode = classedTextNodes.filter(n => n.parsedValue == '204-7501111-7892320')[0]!;
    console.log(idNode);

    const ggParent = idNode.parent.parent.parent;
    console.log(ggParent);
  }
);

test(
  'transaction date regex',
  () => {
    const goodDate = '09 Jun 2025';
    const re = patterns.get(ComponentName.DATE);
    console.log(re.source);
    // const match = re.exec(goodDate);
    const match = goodDate.match(re);
    console.log(match);
    expect(match).not.toBeNull;
    expect(match[0]).toEqual(goodDate);
  }
);

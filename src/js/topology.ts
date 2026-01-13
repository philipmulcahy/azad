/* Copyright(c) 2025 Philip Mulcahy. */


// TODO - consider whether we should make this a function
// so as to constrain the lifetime (and memory consumption) of _elementMap.
// The function would take the constructor arguments as inputs and return
// a collection of Classed nodes that do not retain _elementMap.
export class TopologicalScrape<TEnum> {
   _elementMap: Map<Node, ClassedNode<TEnum>>
     = new Map<Node, ClassedNode<TEnum>>();
  
  _patterns: Map<TEnum, RegExp>;
  _classify: (n: ClassedNode<TEnum>) => Set<TEnum>;
  _root: ClassedNode<TEnum>;

  constructor(
    patterns: Map<TEnum, RegExp>,
    classifyNode: (n: ClassedNode<TEnum>) => Set<TEnum>,
    rootNode: HTMLElement,
  ) {
    this._patterns = patterns;
    this._classify = classifyNode;
    this._root = ClassedNode.create<TEnum>(rootNode, this);
  }

  classify(n: ClassedNode<TEnum>): Set<TEnum> {
    return this._classify(n);
  }

  get classified(): ClassedNode<TEnum>[] {
    return [...this._elementMap.values()];
  }
}

export class ClassedNode<TEnum> {
  _element: HTMLElement;
  _possibleComponents = new Map<TEnum, string|null>();
  _descendants: ClassedNode<TEnum>[] = [];
  _owner: TopologicalScrape<TEnum>;

  // Use create(...) instead
  private constructor(
    n: HTMLElement,
    owner: TopologicalScrape<TEnum>,
  ) {
    if (n.nodeName == '#text') {
      throw new Error('#text nodes are not elements');
    }

    this._element = n;
    this._owner = owner;

    for (const child of this.children) {
      if (child.components.size > 0) {
        this._descendants.push(child);
      }

      for (const d of child.classedDescendants) {
        this._descendants.push(d);
      }
    }

    for (const name of this._owner.classify(this)) {
      if (this._owner._patterns.has(name)) {
        const parsedValue = this.match(name);

        this._possibleComponents.set(name, parsedValue);
      } else {
        this._possibleComponents.set(name, null);
      }
    }

    this._owner._elementMap.set(n, this);
  }

  // Prevent duplicate ClassedNode objects for the same Node object
  static create<T>(
    n: HTMLElement,
    owner: TopologicalScrape<T>
  ): ClassedNode<T> {
    if (n == null || typeof(n) == 'undefined') {
      throw new Error('cannot make a ClassedNode from a null or undefined element');
    }

    if (owner._elementMap.has(n)) {
      return owner._elementMap.get(n)!;
    }

    return new ClassedNode<T>(n, owner);
  }

  get classedDescendants(): ClassedNode<TEnum>[] {
    if (!Array.isArray(this._descendants)) {
      console.error(`not an array, but should be: ${this._descendants}`);
    }

    return [...this._descendants];
  }

  get children(): ClassedNode<TEnum>[] {
    return Array.from(this.element.children??[])
                .filter(c => c.textContent)
                .map(
                  c => ClassedNode.create<TEnum>(
                    c as HTMLElement, this._owner
                  )
                );
  }

  // Establish whether node matches pattern.
  // If it does, return the matching text.
  // If it doesn't then return null.
  match(pattern: TEnum): string | null {
    if (!this._owner._patterns.get(pattern)) {
      return null;
    }

    const re: RegExp = this._owner._patterns.get(pattern)!;
    const text: string = this.directText;

    if(!text) {
      return null;
    }

    const m = text.match(re);

    if (!m) {
      return null;
    }

    return m[1];
  }

  get components(): Set<TEnum> {
    return new Set(this._possibleComponents.keys());
  }

  get element(): HTMLElement {
    return this._element;
  }

  get parent(): ClassedNode<TEnum> {
    return ClassedNode.create<TEnum>(this.element.parentElement!, this._owner);
  }

  getParsedValue(component: TEnum): string | null {
    return this._owner._patterns.has(component) ?
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
    return [...this.element.childNodes]
      .map(
        n => {
          if (n.nodeName.toLowerCase() == '#text') {
            return n.textContent;
          }

          if (this._owner._elementMap.has(n)) {
            const cn = this._owner._elementMap.get(n);
            const txt = cn.text;  // recurse

            if (n.nodeName.toLowerCase() == 'div') {
              return txt + '\n';
            }

            return txt;
          }
        }
      )
      .join(' ')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/ +/, ' ')
      .replace(/^\s+|\s+$/, '');
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

  hasSiblingToLeft(predicate: (sibling: ClassedNode<TEnum>) => boolean) {
    let s = this.left;

    while (s != null) {
      if (predicate(s)) {
        return true;
      }

      s = s.left;
    }

    return false;
  }

  get left(): ClassedNode<TEnum> | null {
    let s = this.element.previousSibling;

    while (s != null && s.nodeName.toLowerCase() == '#text') {
      s = s.previousSibling;
    }

    return s != null ?
      ClassedNode.create<TEnum>(s as HTMLElement, this._owner) :
      null;
  }

  toString(): string {
    return `ClassedNode(${[...this.components].join('|')}, ` +
           `descendants:${this.classedDescendants.join('|')}, ` +
           `${this.directText == '' ? this.type : this.directText})`;
  }

}

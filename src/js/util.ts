/* Copyright(c) 2016-2020 Philip Mulcahy. */

'use strict';

const xpath = require('xpath');

export function defaulted<T>(
    value: T | null | undefined,
    def_value: T
): T {
    if (value != null && typeof(value) !== 'undefined') {
        return value;
    }
    return def_value;
}

export function parseStringToDOM(html: string) {
    if ( typeof(DOMParser) !== 'undefined' ) {
        // We're in a browser:
        const parser = new DOMParser();
        return parser.parseFromString( html, 'text/html' );
    } else {
        // DOMParse not present in node.js, so we need to get our own: jsdom.
        // We don't use jsdom all the time, because it in turn requires the
        // fs module which isn't available in browsers. (This was difficult
        // to debug!).
        const jsdom = require('jsdom');  // eslint-disable-line no-undef
        return new jsdom.JSDOM(html).window.document;
    }
}

export function isNumeric(n: any) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function getXPathResult() {
    if (typeof(XPathResult) === 'undefined') {
        return xpath.XPathResult;
    }
    return XPathResult;
}

export function addButton(name: string, cb: any, button_class: string) {
    removeButton(name);
    const a = document.createElement('button');
    if(typeof(button_class) === 'undefined') {
        button_class = 'azad_default_button';
    }
    a.innerText = name;
    a.setAttribute('class', button_class);
    a.setAttribute('button_name', name);
    a.onclick = cb;
    document.body.insertBefore(
        a,
        document.body.firstChild
    );
}

export function removeButton(name: string) {
    const elem = document.querySelector('[button_name="' + name + '"]');
    if ( elem !== null ) {
        elem.parentNode!.removeChild(elem);
    }
}

export function findSingleNodeValue(xpath: string, elem: HTMLElement): Node {
    try {
        const node = elem.ownerDocument!.evaluate(
            xpath,
            elem,
            null,
            getXPathResult().FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (!node) {
            throw 'No node found';
        }
        return node;
    } catch (ex) {
        throw ex + ': findSingleNodeValue didn\'t match: ' + xpath;
    }
}

export function findMultipleNodeValues(
    xpath: string,
    elem: HTMLElement
): Node[] {
    const snapshot = elem.ownerDocument!.evaluate(
        xpath,
        elem,
        null,
        getXPathResult().ORDERED_NODE_SNAPSHOT_TYPE,
        null
    );
    const values: Node[] = [];
    let i;
    for(i = 0; i !== snapshot.snapshotLength; i += 1) {
        const node: Node|null = snapshot.snapshotItem(i);
        if (node) {
            values.push(node);
        }
    }
    return values;
}

export function clearBody() {
    Array.from(document.body.children).forEach(
        function(elem: Element) {
            if( !(
                elem.hasAttribute('class') &&
                elem.getAttribute('class')!.includes('order_reporter_')
            )) {
                document.body.removeChild(elem);
            }
        }
    );
}

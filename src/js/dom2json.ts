/* Copyright(c) 2018 Philip Mulcahy. */

// Thanks to Simon Sturmer: sstur/dom-to-json.js

'use strict';

export interface IJsonObject {
    [index: string]: any
}

export function toJSON(
    node: any,
    include_attribs?: Set<string>,
    exclude_elem_types?: Set<string>
): IJsonObject|null {
  // @ts-ignore: this has weird/missing type.
  node = node || this;

  const obj: Record<string, any> = {
    nodeType: node.nodeType
  };
  if (node.tagName) {
    obj.tagName = node.tagName.toLowerCase();
    if (exclude_elem_types && exclude_elem_types.has(obj.tagName)) {
        return null;
    }
  } else
  if (node.nodeName) {
    obj.nodeName = node.nodeName;
  }
  if (node.nodeValue) {
    obj.nodeValue = node.nodeValue;
  }
  const attrs = node.attributes;
  if (attrs) {
    const arr = [];
    for (var i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      arr.push([attr.nodeName, attr.nodeValue]);
    }
    if ( include_attribs == undefined ) {
        obj.attributes = arr;
    } else {
        obj.attributes = arr.filter( a => include_attribs.has(a[0]) );
    }
  }
  const childNodes: NodeListOf<ChildNode> = node.childNodes;
  if (childNodes) {
    obj.childNodes = Array.from(childNodes)
                          .map( n => toJSON(n, include_attribs) )
                          .filter( n => n )
  }
  return obj;
}

export function toDOM(obj: IJsonObject | string): Node {
  if (typeof obj == 'string') {
    obj = <IJsonObject>(JSON.parse(obj));
  }
  let node: any = null;
  const nodeType = obj.nodeType;
  switch (nodeType) {
    case 1: //ELEMENT_NODE
      node = document.createElement(obj.tagName);
      {
          const attributes = obj.attributes || [];
          for (var i = 0, len = attributes.length; i < len; i++) {
            const attr = attributes[i];
            node.setAttribute(attr[0], attr[1]);
          }
      }
      break;
    case 3: //TEXT_NODE
      node = document.createTextNode(obj.nodeValue);
      break;
    case 8: //COMMENT_NODE
      node = document.createComment(obj.nodeValue);
      break;
    case 9: //DOCUMENT_NODE
      node = document.implementation.createDocument(null, null, null);
      break;
    case 10: //DOCUMENT_TYPE_NODE
      node = document.implementation.createDocumentType(
          obj.nodeName,
          // @ts-ignore: arg is supposed to be a string
          null,
          // @ts-ignore: arg is supposed to be a string
          null
      );
      break;
    case 11: //DOCUMENT_FRAGMENT_NODE
      node = document.createDocumentFragment();
      break;
    default:
      return node;
  }
  if (nodeType == 1 || nodeType == 11) {
    const childNodes = obj.childNodes || [];
    for (i = 0, len = childNodes.length; i < len; i++) {
      node.appendChild(toDOM(childNodes[i]));
    }
  }
  return node;
}

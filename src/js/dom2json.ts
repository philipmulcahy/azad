/* Copyright(c) 2018 Philip Mulcahy. */

// Thanks to Simon Sturmer: sstur/dom-to-json.js

'use strict';

export function toJSON(node: any) {
  node = node || this;
  const obj: Record<string, any> = {
    nodeType: node.nodeType
  };
  if (node.tagName) {
    obj.tagName = node.tagName.toLowerCase();
  } else
  if (node.nodeName) {
    obj.nodeName = node.nodeName;
  }
  if (node.nodeValue) {
    obj.nodeValue = node.nodeValue;
  }
  const attrs = node.attributes;
  if (attrs) {
    const length = attrs.length;
    const arr = obj.attributes = new Array(length);
    for (var i = 0; i < length; i++) {
      const attr = attrs[i];
      arr[i] = [attr.nodeName, attr.nodeValue];
    }
  }
  const childNodes: NodeListOf<ChildNode> = node.childNodes;
  if (childNodes) {
    const length = childNodes.length;
    const arr = obj.childNodes = new Array(length);
    for (i = 0; i < length; i++) {
      arr[i] = toJSON(childNodes[i]);
    }
  }
  return obj;
}

export function toDOM(obj: Record<string, any>) {
  if (typeof obj == 'string') {
    obj = JSON.parse(obj);
  }
  var node;
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
          null,
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

export default {
    toJSON: toJSON,
    toDOM: toDOM
};

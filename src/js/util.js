/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */
/* global XPathResult */

'use strict';

import xpath from 'xpath';

function parseStringToDOM(html) {
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

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function getXPathResult() {
    if (typeof(XPathResult) === 'undefined') {
        return xpath.XPathResult;
    }
    return XPathResult;
}

function getSite() {
    const href = window.location.href;
    const stem = new RegExp('https:\\/\\/((www|smile)\\.amazon\\.[^\\/]+)').exec(href)[1];
    return stem;
}

function getOrderDetailUrl(orderId, site) {
    return 'https://' + site + '/gp/your-account/order-details/' +
        'ref=oh_aui_or_o01_?ie=UTF8&orderID=' + orderId;
}

function getOrderPaymentUrl(orderId, site) {
    if ( !orderId ) {return 'N/A'; }
    return orderId.startsWith('D') ?
        'https://' + site + '/gp/digital/your-account/order-summary.html' +
            '?ie=UTF8&orderID=' + orderId + '&print=1&' :
        'https://' + site + '/gp/css/summary/print.html' +
            '/ref=oh_aui_ajax_pi?ie=UTF8&orderID=' + orderId;
}

function addButton(name, cb, button_class) {
    const existing = document.querySelector('[button_name="' + name + '"]');
    if ( existing !== null ) {
        existing.parentNode.removeChild(existing);
    }
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

function removeButton(name) {
    const elem = document.querySelector('[button_name="' + name + '"]');
    if ( elem !== null ) {
        elem.parentNode.removeChild(elem);
    }
}

function findSingleNodeValue(xpath, elem) {
    try {
        return elem.ownerDocument.evaluate(
            xpath,
            elem,
            null,
            getXPathResult().FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
    } catch (ex) {
        console.log('findSingleNodeValue didn\'t match: ', xpath);
    }
}

function findMultipleNodeValues(xpath, elem) {
    const snapshot = elem.ownerDocument.evaluate(
        xpath,
        elem,
        null,
        getXPathResult().ORDERED_NODE_SNAPSHOT_TYPE,
        null
    );
    const values = [];
    let i;
    for(i = 0; i !== snapshot.snapshotLength; i += 1) {
        values.push(snapshot.snapshotItem(i));
    }
    return values;
}

function clearBody() {
    Array.from(document.body.children).forEach(
        function(elem) {
            if( !(
                elem.hasAttribute('class') &&
                elem.getAttribute('class').includes('order_reporter_')
            )) {
                document.body.removeChild(elem);
            }
        }
    );
}

export default {
    addButton: addButton,
    clearBody: clearBody,
    findMultipleNodeValues: findMultipleNodeValues,
    findSingleNodeValue: findSingleNodeValue,
    getOrderDetailUrl: getOrderDetailUrl,
    getOrderPaymentUrl: getOrderPaymentUrl,
    getSite: getSite,
    isNumeric: isNumeric,
    parseStringToDOM: parseStringToDOM,
    removeButton: removeButton
};

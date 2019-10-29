/* Copyright(c) 2019 Philip Mulcahy. */
/* Copyright(c) 2018 Philip Mulcahy. */
/* Copyright(c) 2016 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */
/* global XPathResult */

"use strict";

// Identify and return the Amazon domain for the current site.
// Used by: getOrderDetaiURL, getOrderPaymentURL, table.cols, order.getOrdersForYearAndQueryTemplate.generateQueryString, order.getOrdersForYearAndQueryTemplate.convertOrdersPage, order.fetchYear.
function getSite() {
    const href = window.location.href;
    const stem = new RegExp('https:\\/\\/((www|smile)\\.amazon\\.[^\\/]+)').exec(href)[1];
    return stem;
}

// Assemble the URL for the order details page.
// Used by: table.cols, order.ExtractDetailPromise, order.Order.extractOrder
function getOrderDetailUrl(orderId) {
    return "https://" + getSite() + "/gp/your-account/order-details/" +
        "ref=oh_aui_or_o01_?ie=UTF8&orderID=" + orderId;
}

// Assemble the URL for the invoice page.
// Used by: table.reallyDisplayOrders.appendOrderRow, order.Order.extractOrder
function getOrderPaymentUrl(orderId) {
    if ( !orderId ) { return "N/A"; }
    return orderId.startsWith("D") ?
        "https://" + getSite() + "/gp/digital/your-account/order-summary.html" +
            "?ie=UTF8&orderID=" + orderId + "&print=1&" :
        "https://" + getSite() + "/gp/css/summary/print.html" +
            "/ref=oh_aui_ajax_pi?ie=UTF8&orderID=" + orderId;
}

function addButton(name, cb, style) {
    var existing = document.querySelector('[button_name="' + name + '"]');
    if ( existing !== null ) {
        existing.parentNode.removeChild(existing);
    }
    var a = document.createElement("button");
    if(typeof(style) === "undefined") {
        style = "background-color:orange; color:white";
    }
    a.innerText = name;
    a.setAttribute("style", style);
    a.setAttribute("class", "azad_order_reporter_button");
    a.setAttribute("button_name", name);
    a.onclick = cb;
    document.body.insertBefore(
        a,
        document.body.firstChild
    );
}

function removeButton(name) {
    var elem = document.querySelector('[button_name="' + name + '"]');
    if ( elem !== null ) {
        elem.parentNode.removeChild(elem);
    }
}

/***********************************************************************
 * Search elem for a HTML node described by xpath
 **********************************************************************/
function findSingleNodeValue(xpath, elem) {
    try {
        return elem.ownerDocument.evaluate(
            xpath,
            elem,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
    } catch (ex) {
        console.log('findSingleNodeValue blew up with: ', xpath);
    }
}

/***********************************************************************
 * Search elem for one or more HTML nodes described by xpath
 **********************************************************************/
function findMultipleNodeValues(xpath, elem) {
    const snapshot = elem.ownerDocument.evaluate(
        xpath,
        elem,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
    );
    const values = [];
    let i;
    for(i = 0; i !== snapshot.snapshotLength; i += 1) {
        values.push(snapshot.snapshotItem(i));
    }
    return values;
}

// Remove buttons?
function clearBody() {
    Array.from(document.body.children).forEach(
        function(elem) {
            if( !(
                elem.hasAttribute("class") &&
                elem.getAttribute("class").includes("azad_order_reporter_")
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
    removeButton: removeButton
};

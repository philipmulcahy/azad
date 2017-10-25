/* Copyright(c) 2016 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */
/* global XPathResult */

var amazon_order_history_util = (function(){
    "use strict";
    function getSite() {
        var href = window.location.href;
        var stem = /https:\/\/((www|smile)\.amazon\.[^\/]+)/.exec(href)[1];
        return stem;
    }

    function updateStatus(msg) {
        document.getElementById("order_reporter_notification").textContent = msg;
    }

    function getOrderDetailUrl(orderId) {
        return "https://" + getSite() + "/gp/your-account/order-details/" +
            "ref=oh_aui_or_o01_?ie=UTF8&orderID=" + orderId;
    }

    function getOrderPaymentUrl(orderId) {
        return orderId.startsWith("D") ?
//          "https://www.amazon.co.uk/gp/digital/your-account/order-summary.html/ref=oh_aui_dor_o00_?ie=UTF8&orderID=" + orderId :
            "https://" + getSite() + "/gp/digital/your-account/order-summary.html" +
                "?ie=UTF8&orderID=" + orderId + "&print=1&" :
            "https://" + getSite() + "/gp/css/summary/print.html" +
                "/ref=oh_aui_ajax_pi?ie=UTF8&orderID=" + orderId;
    }

    function addButton(name, cb, style) {
        var a = document.createElement("button");
        if(typeof(style) === "undefined") {
            style = "background-color:orange; color:white";
        }
        a.innerText = name;
        a.setAttribute("style", style);
        a.onclick = cb;
        document.body.insertBefore(
            a,
            document.body.firstChild
        );
    }

    function findSingleNodeValue(xpath, doc, elem) {
        return doc.evaluate(
            xpath,
            elem,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
    }

    function findMultipleNodeValues(xpath, doc, elem) {
        var snapshot;
        try {
            snapshot = doc.evaluate(
                xpath,
                elem,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null
            );
        } catch(err) {
            updateStatus(
                "Error: maybe you\"re not logged into " +
                "https://" + getSite() + "/gp/css/order-history " +
                err
            );
            return [];
        }
        var values = [];
        var i;
        for(i = 0; i !== snapshot.snapshotLength; i += 1) {
            values.push(snapshot.snapshotItem(i));
        }
        return values;
    }

    return {
        addButton: addButton,
        findMultipleNodeValues: findMultipleNodeValues,
        findSingleNodeValue: findSingleNodeValue,
        getOrderDetailUrl: getOrderDetailUrl,
        getOrderPaymentUrl: getOrderPaymentUrl,
        getSite: getSite,
        updateStatus: updateStatus
    };
})();

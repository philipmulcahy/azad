/* Copyright(c) 2016 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_util = (function(){
    "use strict";
    function getSite() {
        var href = window.location.href;
        var stem = /https:\/\/((www|smile)\.amazon\.[^\/]+)/.exec(href)[1];
        return stem;
    }

    function getOrderDetailUrl(orderId) {
        return "https://" + getSite() + "/gp/your-account/order-details/" +
            "ref=oh_aui_or_o01_?ie=UTF8&orderID=" + orderId;
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

    return {
        getSite: getSite,
        getOrderDetailUrl: getOrderDetailUrl,
        addButton: addButton,
        findSingleNodeValue: findSingleNodeValue
    };
})();

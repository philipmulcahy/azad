/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* global XPathResult */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_inject = (function () {
    "use strict";

    function updateStatus(msg) {
        document.getElementById("order_reporter_notification").textContent = msg;
    }

    class YearFetcher {
        constructor(year) {
            this.year = year;
            this.expected_order_count = null;
            this.order_found_callback = null;
            this.query_string_templates = {
                "www.amazon.de": "https://%(site)s/gp/css/order-history" +
                "?opt=ab&digitalOrders=1" +
                "&unifiedOrders=1" +
                "&returnTo=" +
                "&orderFilter=year-%(year)s" +
                "&startIndex=%(startOrderPos)s" +
                "&language=en_GB",
                "www.amazon.co.uk": "https://%(site)s/gp/css/order-history" +
                "?opt=ab&digitalOrders=1" +
                "&unifiedOrders=1" +
                "&returnTo=" +
                "&orderFilter=year-%(year)s" +
                "&startIndex=%(startOrderPos)s",
                "smile.amazon.com": "https://%(site)s/gp/css/order-history" +
                "?opt=ab&digitalOrders=1&" +
                "&unifiedOrders=1" +
                "&returnTo=" +
                "&orderFilter=year-%(year)s" +
                "&startIndex=%(startOrderPos)s",
                "www.amazon.com": "https://%(site)s/gp/your-account/order-history" +
                "?ie=UTF8" +
                "&orderFilter=year-%(year)s" +
                "&startIndex=%(startOrderPos)s" +
                "&unifiedOrders=0"
            };

            /* Promise to array of Order Promise. */
            this.orders = new Promise(
                function (resolve, reject) {
                    var orders = [];
                    this.order_found_callback = function (order) {
                        orders.push(order);
                        order.then(
                            function (order) {
                                updateStatus("Fetching " + order.id);
                            }
                        );
                        if (orders.length === this.expected_order_count) {
                            resolve(orders);
                        }
                    };
                    this.sendGetOrderCount();
                }.bind(this)
            );
        }

        generateQueryString(startOrderPos) {
            var template = this.query_string_templates[amazon_order_history_util.getSite()];
            return sprintf(
                template, {
                    site: amazon_order_history_util.getSite(),
                    year: this.year,
                    startOrderPos: startOrderPos
                }
            );
        }

        sendGetOrderCount() {
            var req = new XMLHttpRequest();
            var query = this.generateQueryString(0);
            req.open("GET", query, true);
            req.onload = this.receiveGetOrderCount.bind(this);
            req.send();
        }

        receiveGetOrderCount(evt) {
            var iorder;
            var req;
            var query;
            var p = new DOMParser();
            var d = p.parseFromString(evt.target.responseText, "text/html");
            var countSpan = d.evaluate(
                ".//span[@class=\"num-orders\"]",
                d,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
            this.expected_order_count = parseInt(
                countSpan.textContent.split(" ")[0], 10);
            updateStatus(
                "Found " + this.expected_order_count + " orders for " + this.year
            );
            this.unfetched_count = this.expected_order_count;
            if (isNaN(this.unfetched_count)) {
                updateStatus(
                    "Error: cannot find order count in " + countSpan.textContent
                );
                this.unfetched_count = 0;
            }
            // Request second and subsequent pages.
            for (iorder = 10; iorder < this.expected_order_count; iorder += 10) {
                req = new XMLHttpRequest();
                query = this.generateQueryString(iorder);
                req.open("GET", query, true);
                req.onload = this.receiveOrdersPage.bind(this);
                req.send();
            }
            // We already have the first page.
            this.receiveOrdersPage(evt);
        }

        receiveOrdersPage(evt) {
            var p = new DOMParser();
            var d = p.parseFromString(evt.target.responseText, "text/html");
            var orders;
            var ordersElem;
            var elem;
            var i;
            try {
                ordersElem = d.getElementById("ordersContainer");
                orders = d.evaluate(
                    ".//*[contains(concat(\" \", " +
                    "normalize-space(@class), " +
                    "\" \"), " +
                    "\" order \")]",
                    ordersElem,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );
            } catch (err) {
                updateStatus(
                    "Error: maybe you\"re not logged into " +
                    "https://" + amazon_order_history_util.getSite() + "/gp/css/order-history " +
                    err
                );
                return;
            }

            function makeOrderPromise(elem) {
                return new Promise(
                    function (resolve, reject) {
                        resolve(amazon_order_history_order.create(elem));
                    }
                );
            }
            for (i = 0; i !== orders.snapshotLength; i += 1) {
                elem = orders.snapshotItem(i);
                this.order_found_callback(makeOrderPromise(elem));
            }
        }
    }

    function getTextArrayFromXPathSnapshotResult(snapshots, func) {
        func = defaultFor(
            func,
            function (elem) {
                return elem.textContent.trim();
            }
        );
        var results = [];
        var i;
        var elem;
        for (i = 0; i !== snapshots.snapshotLength; i += 1) {
            elem = snapshots.snapshotItem(i);
            results[results.length] = func(elem);
        }
        return results;
    }

    function getYears() {
        if (typeof (getYears.years) === "undefined") {
            var yearElems = document.evaluate(
                "//select[@name=\"orderFilter\"]/option[@value]",
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null
            );
            getYears.years = getTextArrayFromXPathSnapshotResult(yearElems).filter(
                function (element, index, array) {
                    return (/^\d+$/).test(element);
                }
            );
        }
        return getYears.years;
    }

    /* Returns array of Promise to array of Order Promises. */
    function getOrdersByYear(years) {
        // At return time we may not know how many orders there are, only
        // how many years in which orders have been queried for.
        return years.map(
            function (year) {
                return new YearFetcher(year).orders;
            }
        );
    }

    function fetchAndShowOrders(years) {
        var orders = getOrdersByYear(years);
        Promise.all(orders).then(
            function (arrayOfArrayOfOrderPromise) {
                var orderPromises = [].concat.apply(
                    [],
                    arrayOfArrayOfOrderPromise
                );
                amazon_order_history_table.displayOrders(orderPromises, true);
            }
        );
    }

    function addYearButtons() {
        var notification = document.createElement("span");
        notification.setAttribute("id", "order_reporter_notification");
        document.body.insertBefore(
            notification,
            document.body.firstChild
        );
        var years = getYears();
        if (years.length > 0) {
            amazon_order_history_util.addButton(
                "All years",
                function () {
                    fetchAndShowOrders(years);
                }
            );
        }
        years.forEach(
            function (year) {
                amazon_order_history_util.addButton(
                    [year],
                    function () {
                        fetchAndShowOrders([year]);
                    }
                );
            }
        );
    }

    function defaultFor(arg, val) {
        return arg === undefined ? val : arg;
    }

    addYearButtons();

    return {
        addYearButtons: addYearButtons
    };
})();
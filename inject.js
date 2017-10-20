/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_inject = (function() {
    "use strict";

    class YearFetcher {
        constructor(year) {
            this.year = year;
            this.expected_order_count = null;
            this.order_found_callback = null;
            this.query_string_templates = {
                "www.amazon.co.uk": "https://%(site)s/gp/css/order-history" +
                    "?opt=ab&digitalOrders=1" +
                    "&unifiedOrders=1" +
                    "&returnTo=" +
                    "&orderFilter=year-%(year)s" +
                    "&startIndex=%(startOrderPos)s",
                "www.amazon.de": "https://%(site)s/gp/css/order-history" +
                    "?opt=ab&digitalOrders=1" +
                    "&unifiedOrders=1" +
                    "&returnTo=" +
                    "&orderFilter=year-%(year)s" +
                    "&startIndex=%(startOrderPos)s" +
                    "&language=en_GB",
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
                function(resolve, reject) {
                    var orders = [];
                    this.order_found_callback = function(order) {
                        orders.push(order);
                        order.then(
                            function(order) {
                                amazon_order_history_util.updateStatus("Fetching " + order.id);
                            }
                        );
                        if(orders.length === this.expected_order_count) {
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
                template,
                {
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
            var countSpan = amazon_order_history_util.findSingleNodeValue(
                ".//span[@class=\"num-orders\"]", d, d)
            this.expected_order_count = parseInt(
                countSpan.textContent.split(" ")[0], 10);
            amazon_order_history_util.updateStatus(
                "Found " + this.expected_order_count + " orders for " + this.year
            );
            this.unfetched_count = this.expected_order_count;
            if(isNaN(this.unfetched_count)) {
                amazon_order_history_util.updateStatus(
                    "Error: cannot find order count in " + countSpan.textContent
                );
                this.unfetched_count = 0;
            }
            // Request second and subsequent pages.
            for(iorder = 10; iorder < this.expected_order_count; iorder += 10) {
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
            } catch(err) {
                amazon_order_history_util.updateStatus(
                    "Error: maybe you\"re not logged into " +
                    "https://" + amazon_order_history_util.getSite() + "/gp/css/order-history " +
                    err
                );
                return;
            }
            orders = amazon_order_history_util.findMultipleNodeValues(
                ".//*[contains(concat(\" \", " +
                    "normalize-space(@class), " +
                    "\" \"), " +
                    "\" order \")]",
                d,
                ordersElem
            );
            function makeOrderPromise(elem) {
                return new Promise(
                    function(resolve, reject) {
                        resolve(
                            amazon_order_history_order.create(elem)
                        );
                    }
                );
            }
            orders.forEach(
                function(elem){
                    this.order_found_callback(
                        makeOrderPromise(elem)
                    );
                }.bind(this)
            ); 
        }
    }

    function getYears() {
        if(typeof(getYears.years) === "undefined") {
            var snapshot = amazon_order_history_util.findMultipleNodeValues(
                "//select[@name=\"orderFilter\"]/option[@value]",
                document,
                document);
            getYears.years = snapshot.map(
                function(elem){
                    return elem.textContent.trim();
                }
            ).filter(
                function(element, index, array) {
                    return(/^\d+$/).test(element);
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
            function(year) {
                return new YearFetcher(year).orders;
            }
        );
    }

    function fetchAndShowOrders(years) {
        var orders = getOrdersByYear(years);
        Promise.all(orders).then(
            function(arrayOfArrayOfOrderPromise) {
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
        if(years.length > 0) {
            amazon_order_history_util.addButton(
                "All years",
                function() {
                    fetchAndShowOrders(years);
                }
            );
        }
        years.forEach(
            function(year) {
                amazon_order_history_util.addButton(
                    [year],
                    function() {
                        fetchAndShowOrders([year]);
                    }
                );
            }
        );
    }

    addYearButtons();

    return {
        addYearButtons: addYearButtons
    };
})();

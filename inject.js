/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_inject = (function() {
    "use strict";

    var request_scheduler = amazon_order_history_request_scheduler.create();

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
            this.orderPromises = [];
			this.sendGetOrderCount = function() {
				request_scheduler.schedule(
					this.generateQueryString(0),
					this.receiveGetOrderCount.bind(this),
					"00000"
				);
			};
			this.generateQueryString = function(startOrderPos) {
				var template = this.query_string_templates[amazon_order_history_util.getSite()];
				return sprintf(
					template,
					{
						site: amazon_order_history_util.getSite(),
						year: this.year,
						startOrderPos: startOrderPos
					}
				);
			};
			this.receiveGetOrderCount = function(evt) {
				var iorder;
				var p = new DOMParser();
				var d = p.parseFromString(evt.target.responseText, "text/html");
				var countSpan = amazon_order_history_util.findSingleNodeValue(
					".//span[@class=\"num-orders\"]", d, d);
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
					request_scheduler.schedule(
						this.generateQueryString(iorder),
						this.receiveOrdersPage.bind(this),
						"2"
					);
				}
				// We already have the first page.
				this.receiveOrdersPage(evt);
			};
			this.receiveOrdersPage = function(evt) {
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
								amazon_order_history_order.create(elem, request_scheduler)
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
			};

            /* Promise to array of Order Promise. */
            this.ordersPromise = new Promise(
                function(resolve, reject) {
                    this.order_found_callback = function(orderPromise) {
                        this.orderPromises.push(orderPromise);
                        orderPromise.then(
                            function(order) {
								// TODO is "Fetching" the right message for this stage?
                                amazon_order_history_util.updateStatus("Fetching " + order.id);
                            }
                        );
                        amazon_order_history_util.updateStatus(
                            "YearFetcher orderPromises.length:" +
                             this.orderPromises.length +
                             " expected_order_count:" +
                             this.expected_order_count
						);
                        if(this.orderPromises.length === this.expected_order_count) {
                            resolve(this.orderPromises);
                        }
                    };
                    this.sendGetOrderCount();
                }.bind(this)
            );
        }
    }

	/* Returns array of Promise to array of Order Promises. */
	function getOrdersByYear(years) {
		// At return time we may not know how many orders there are, only
		// how many years in which orders have been queried for.
		return years.map(
			function(year) {
				return new YearFetcher(year).ordersPromise;
			}
		);
	}

	function getYears(){
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

    function addInfoPoints() {
        var notification = document.createElement("ul");
        notification.setAttribute("id", "order_reporter_notification");
        notification.setAttribute("class", "order_reporter_notification");
        notification.setAttribute("hidden", "order_reporter_notification");
        document.body.insertBefore(
            notification,
            document.body.firstChild
        );
        var progress = document.createElement("div");
        progress.setAttribute("id", "order_reporter_progress");
        progress.setAttribute("class", "order_reporter_progress");
        progress.setAttribute(
            "style", "position:absolute; top:0; right:0; color:orange; padding:0.2em; font-size:75%");
        document.body.insertBefore(
            progress,
            document.body.firstChild
        );
    }

    addYearButtons();
    addInfoPoints();
    amazon_order_history_util.updateStatus("Starting");
})();

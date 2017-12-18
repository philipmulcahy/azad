/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_inject = (function() {
    "use strict";

    var request_scheduler = amazon_order_history_request_scheduler.create();

	function getYears(){
		if(typeof(getYears.years) === "undefined") {
			var snapshot = amazon_order_history_util.findMultipleNodeValues(
				"//select[@name=\"orderFilter\"]/option[@value]",
				document,
				document);
			getYears.years = snapshot.map(
				function(elem){
					return elem.textContent
                               .replace("nel", "")  // amazon.it
                               .trim();
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
		return amazon_order_history_order.getOrdersByYear(years, request_scheduler).then(
			function(orderPromises) {
				amazon_order_history_table.displayOrders(orderPromises, true);
				return document.querySelector("[id=\"order_table\"]");
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

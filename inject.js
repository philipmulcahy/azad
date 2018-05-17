/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* jshint strict: true, esversion: 6 */

const amazon_order_history_inject = (function() {
    'use strict';

    const request_scheduler = amazon_order_history_request_scheduler.create();

	function getYears(){
		if(typeof(getYears.years) === 'undefined') {
			const snapshot = amazon_order_history_util.findMultipleNodeValues(
				'//select[@name=\"orderFilter\"]/option[@value]',
				document,
				document);
			getYears.years = snapshot.map( elem => {
                return elem.textContent
                           .replace('nel', '')  // amazon.it
                           .trim();
            }).filter( (element, index, array) => {
                return(/^\d+$/).test(element);
            });
		}
		return getYears.years;
	}

    function fetchAndShowOrders(years) {
		amazon_order_history_order.getOrdersByYear(
            years, request_scheduler
        ).then(
			orderPromises => {
				amazon_order_history_table.displayOrders(orderPromises, true);
				return document.querySelector('[id=\"order_table\"]');
			}
		);
    }

    function addYearButtons() {
        const years = getYears();
        chrome.runtime.sendMessage({action: 'open_new_tab'});
        if(years.length > 0) {
            amazon_order_history_util.addButton(
                'All years',
                () => {
                    fetchAndShowOrders(years);
                }
            );
        }
        years.forEach( year => {
            amazon_order_history_util.addButton(
                [year],
                () => {
                    fetchAndShowOrders([year]);
                }
            );
        });
    }

    function addInfoPoints() {
        const progress = document.createElement('div');
        progress.setAttribute('id', 'order_reporter_progress');
        progress.setAttribute('class', 'order_reporter_progress');
        progress.setAttribute(
            'style', 'position:absolute; top:0; right:0; color:orange; padding:0.2em; font-size:75%');
        document.body.insertBefore(
            progress,
            document.body.firstChild
        );
    }

    addYearButtons();
    addInfoPoints();
    console.log('Starting');
})();

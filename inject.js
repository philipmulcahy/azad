/* Copyright(c) 2016 Philip Mulcahy. */
/* global window */
/* jshint strict: true, esversion: 6 */

const amazon_order_history_inject = (function() {
    'use strict';

    const request_scheduler = amazon_order_history_request_scheduler.create();

	function getYears() {
		if(typeof(getYears.years) === 'undefined') {
            console.log('getYears() needs to do something');
			const snapshot = amazon_order_history_util.findMultipleNodeValues(
				'//select[@name=\"orderFilter\"]/option[@value]',
				document,
				document);
			getYears.years = snapshot.map( elem => {
                return elem.textContent
                           .replace('en', '')  // amazon.fr
                           .replace('nel', '')  // amazon.it
                           .trim();
            }).filter( (element, index, array) => {
                return(/^\d+$/).test(element);
            }).filter( year => (year >= '2004') );
		}
        console.log('getYears() returning ', getYears.years);
		return getYears.years;
	}

    function fetchAndShowOrders(years) {
		amazon_order_history_order.getOrdersByYear(
            years,
            request_scheduler,
            getYears()[0]
        ).then(
			orderPromises => {
                let beautiful = true;
                if (orderPromises.length >= 500) {
                    beautiful = false;
                    alert('500 or more orders found. That\'s a lot! We\'ll start you off with a plain table to make display faster. You can click the blue "datatable" button to restore sorting, filtering etc.');
                }
				amazon_order_history_table.displayOrders(orderPromises, beautiful);
				return document.querySelector('[id=\"order_table\"]');
			}
		);
    }

    function addYearButtons() {
        console.log('addYearButtons starting');
        const years = getYears();
        if(years.length > 0) {
            amazon_order_history_util.addButton(
                'All years',
                () => {
                    fetchAndShowOrders(years);
                }
            );
        } else {
            console.log('addYearButtons no years found');
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

    function addClearCacheButton() {
        amazon_order_history_util.addButton(
            'clear cache',
            () => {
                request_scheduler.clearCache();
            }
        );
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

    console.log('Amazon Order History Reporter starting');
    addYearButtons();
    addClearCacheButton();
    addInfoPoints();
})();

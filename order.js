/* Copyright(c) 2016 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

let amazon_order_history_order = (function() {
    'use strict';

    function getField(xpath, doc, elem) {
        let valueElem = amazon_order_history_util.findSingleNodeValue(xpath, doc, elem);
        try {
            return valueElem.textContent.trim();
        } catch (_) {
            return '?';
        }
    }

    class Order {
        constructor(ordersPageElem, request_scheduler) {
            this.id = null;
            this.date = null;
            this.total = null;
            this.who = null;
            this.detail_promise = null;
            this.items = null;
            this.request_scheduler = request_scheduler;
            this.extractOrder(ordersPageElem);
        }

        extractOrder(elem) {
            let getItems = function(elem) {
                /*
                  <a class="a-link-normal" href="/gp/product/B01NAE8AW4/ref=oh_aui_d_detailpage_o01_?ie=UTF8&amp;psc=1">
                      The Rise and Fall of D.O.D.O.
                  </a>
                  or
                  <a class="a-link-normal" href="/gp/product/B06X9BZNDM/ref=oh_aui_d_detailpage_o00_?ie=UTF8&amp;psc=1">
                      Provenance
                  </a>
                  but a-link-normal is more common than this, so we need to match on gp/product
                  like this: .//div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]
                  then we get:
                      name from contained text
                      link from href attribute
                      item: not sure what we use this for - will it still work?
                */
                const itemResult = amazon_order_history_util.findMultipleNodeValues(
                    './/div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]',
                    elem.ownerDocument,
                    elem);
                let items = {};
                itemResult.forEach(
                    function(item){
                        const name = item.innerText.replace(/[\n\r]/g, " ")
                                                 .replace(/  */g, " ")
                                                 .trim();
                        const link = item.getAttribute('href');
                        items[name] = link;
                    }
                );
                return items;
            };
            const doc = elem.ownerDocument;
            this.date = getField(
                ['Commande effectuée', 'Order placed'].map(
                    label => sprintf(
                        './/div[contains(span,"%s")]' +
                        '/../div/span[contains(@class,"value")]',
                        label
                    )
                ).join('|'),
                doc,
                elem
            );
            this.total = getField('.//div[contains(span,"Total")]' +
                '/../div/span[contains(@class,"value")]', doc, elem);
            this.who = getField('.//div[contains(@class,"recipient")]' +
                '//span[@class="trigger-text"]', doc, elem);
            if (this.who === '?') {
                this.who = 'N/A';
            }
            this.id = getField(
                ['Order #', 'commande'].map(
                    label => sprintf(
                        './/div[contains(@class,"a-row")]' +
                        '[span[contains(@class,"label")]]' +
                        '[span[contains(@class,"value")]]' +
                        '[contains(span,"%s")]' +
                        '/span[contains(@class,"value")]',
                        label
                    )
                ).join(' | '),
                doc,
                elem
            );
            this.items = getItems(elem);
            this.detail_promise = new Promise(
                function(resolve, reject) {
                    const query = amazon_order_history_util.getOrderDetailUrl(this.id);
                    const evt_callback = function(evt) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(
                            evt.target.responseText, 'text/html'
                        );
                        const gift = function(){
                            let a = getField(
                                '//div[contains(@id,"od-subtotals")]//' +
                                'span[contains(text(),"Gift")]/' +
                                    'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            let b;
                            if( a !== "?") {
                                return a.replace('-', '');
                            }
                            a = getField(
                                '//*[text()[contains(.,"Gift Certificate")]]',
                                doc,
                                doc.documentElement
                            );
                            if( a !== null ) {
                                b = a.match(
                                    /Gift Certificate.Card Amount: *([$£€0-9.]*)/);
                                if( b !== null ) {
                                    return b[1];
                                }
                            }
                            a = getField(
                                '//*[text()[contains(.,"Gift Card")]]',
                                doc,
                                doc.documentElement
                            );
                            if( a !== null ) {
                                b = a.match(
                                    /Gift Card Amount: *([$£€0-9.]*)/);
                                if( b !== null ) {
                                    return b[1];
                                }
                            }
                            return "N/A";
                        }.bind(this);
                        const postage = function() {
                            let a = getField(
                                '//div[contains(@id,"od-subtotals")]//' +
                                'span[contains(text(),"Postage")]/' +
                                    'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            if (a !== "?") {
                                return a;
                            }
                            a = getField(
                                '//div[contains(@id,"od-subtotals")]//' +
                                'span[contains(text(),"Shipping")]/' +
                                'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            if (a !== "?") {
                                return a;
                            }
                            return "N/A";
                        }.bind(this);
                        const vat = function(){
                            let a = getField(
                                '//div[contains(@id,"od-subtotals")]//' +
                                'span[contains(text(),"VAT") and not(contains(.,"Before"))]/' +
                                    'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            if( a !== "?") {
                                return a;
                            }
                            a = getField(
                                '//div[contains(@id,"od-subtotals")]//' +
                                'span[contains(text(),"tax") and not(contains(.,"before"))]/' +
                                    'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            if( a !== "?") {
                                return a;
                            }
                            a = getField(
                                '//*[text()[contains(.,"VAT") and not(contains(.,"Before"))]]',
                                doc,
                                doc.documentElement
                            );
                            if( a !== null ) {
                                const b = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( b !== null ) {
                                    return b[1];
                                }
                            }
                            a = getField(
                                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//span[contains(text(),"VAT")]/parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement);
                            if( a !== null ) {
                                const c = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( c !== null ) {
                                    return c[1];
                                }
                            }
                            return "N/A";
                        }.bind(this);
                        resolve({
                            postage: postage(),
                            gift: gift(),
                            vat: vat()
                        });
                    }.bind(this);
                    this.request_scheduler.schedule(
                        query,
                        evt_callback,
                        this.id
                    );
                }.bind(this)
            );
            this.payments_promise = new Promise(
                function(resolve, reject) {
                    if (this.id.startsWith("D")) {
                        resolve([ this.date + ": " + this.total]);
                    } else {
                        const query = amazon_order_history_util.getOrderPaymentUrl(this.id);
                        const evt_callback = function(evt) {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(
                                evt.target.responseText, "text/html"
                            );
                            const payments = amazon_order_history_util.findMultipleNodeValues(
                                '//b[contains(text(),"Credit Card transactions")]/' +
                                '../../..//td[contains(text(),":")]/..',
                                doc,
                                doc
                            ).map(function(row){
                                return row.textContent
                                          .replace(/[\n\r]/g, ' ')
                                          .replace(/  */g, '\xa0')  //&nbsp;
                                          .trim();
                            });
                            resolve(payments);
                        }.bind(this);
                        this.request_scheduler.schedule(
                            query,
                            evt_callback,
                            this.id
                        );
                    }
                }.bind(this)
            );
        }

        /**
         * Creates an html element suitable for embedding into a table cell
         * but doesn't actually embed it.
         * @param {document} doc. DOM document needed to create elements.
         */
        itemsHtml(doc) {
            const ul = doc.createElement('ul');
            for(let title in this.items) {
                if(this.items.hasOwnProperty(title)) {
                    const li = doc.createElement('li');
                    ul.appendChild(li);
                    const a = doc.createElement('a');
                    li.appendChild(a);
                    a.textContent = title + '; ';
                    a.href = this.items[title];
                }
            }
            return ul;
        }
    }

    function getOrdersForYearAndQueryTemplate(year, query_template, request_scheduler) {
        let expected_order_count = null;
        let order_found_callback = null;
        let check_complete_callback = null;
        let order_promises = [];
        const sendGetOrderCount = function() {
            request_scheduler.schedule(
                generateQueryString(0),
                receiveGetOrderCount,
                '00000'
            );
        };
        const generateQueryString = function(startOrderPos) {
            return sprintf(
                query_template,
                {
                    site: amazon_order_history_util.getSite(),
                    year: year,
                    startOrderPos: startOrderPos
                }
            );
        };
        const receiveGetOrderCount = function(evt) {
            let p = new DOMParser();
            let d = p.parseFromString(evt.target.responseText, 'text/html');
            let countSpan = amazon_order_history_util.findSingleNodeValue(
                './/span[@class="num-orders"]', d, d);
            expected_order_count = parseInt(
                countSpan.textContent.split(' ')[0], 10);
            console.log(
                'Found ' + expected_order_count + ' orders for ' + year
            );
            let unfetched_count = expected_order_count;
            if(isNaN(unfetched_count)) {
                console.warn(
                    'Error: cannot find order count in ' + countSpan.textContent
                );
                unfetched_count = 0;
            }
            check_complete_callback();
            // Request second and subsequent pages.
            for(let iorder = 10; iorder < expected_order_count; iorder += 10) {
                console.log(
                    'sending request for order: ' + iorder + ' onwards'
                );
                request_scheduler.schedule(
                    generateQueryString(iorder),
                    receiveOrdersPage,
                    '2'
                );
            }
            // We already have the first page.
            receiveOrdersPage(evt);
        };
        const receiveOrdersPage = function(evt) {
            const p = new DOMParser();
            const d = p.parseFromString(evt.target.responseText, 'text/html');
            let ordersElem;
            try {
                ordersElem = d.getElementById('ordersContainer');
            } catch(err) {
                console.warn(
                    'Error: maybe you\'re not logged into ' +
                    'https://' + amazon_order_history_util.getSite() + '/gp/css/order-history ' +
                    err
                );
                return;
            }
            const orders = amazon_order_history_util.findMultipleNodeValues(
                './/*[contains(concat(" ", ' +
                    'normalize-space(@class), ' +
                    '" "), ' +
                    '" order ")]',
                d,
                ordersElem
            );
            function makeOrderPromise(elem) {
                return new Promise( (resolve, reject) => {
                    const order = amazon_order_history_order.create(elem, request_scheduler);
                    resolve(order);
                });
            }
            orders.forEach(
                elem => { order_found_callback( makeOrderPromise(elem) ); }
            );
        };

        // Promise to array of Order Promise.
        return new Promise(
            (resolve, reject) => {
                check_complete_callback = function() {
                    if(order_promises.length === expected_order_count) {
                        console.log('resolving order_promises for ' + year);
                        resolve(order_promises);
                        console.log('resolved order_promises for ' + year);
                    }
                };
                order_found_callback = function(order_promise) {
                    order_promises.push(order_promise);
                    order_promise.then( order => {
                        // TODO is "Fetching" the right message for this stage?
                        console.log('amazon_order_history_order Fetching ' + order.id);
                    });
                    console.log(
                        'YearFetcher order_promises.length:' +
                         order_promises.length +
                         ' expected_order_count:' +
                         expected_order_count
                    );
                    check_complete_callback();
                };
                sendGetOrderCount();
            }
        );
    }

    function fetchYear(year, request_scheduler) {
        let templates = {
            'smile.amazon.co.uk': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],
            'www.amazon.co.uk': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],
            'www.amazon.de': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s' +
                '&language=en_GB'],
            'www.amazon.in': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s' +
                '&language=en_GB'],
            'www.amazon.it': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s' +
                '&language=en_GB'],
            'smile.amazon.ca': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],
            'www.amazon.ca': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],
            'smile.amazon.fr': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],
            'www.amazon.fr': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],
            'smile.amazon.com': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],
            'www.amazon.com': [
                'https://%(site)s/gp/your-account/order-history/ref=oh_aui_menu_date' +
                '?ie=UTF8' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s',
                'https://%(site)s/gp/your-account/order-history/ref=oh_aui_menu_yo_new_digital' +
                '?ie=UTF8' +
                '&digitalOrders=1' +
                '&orderFilter=year-%(year)s' +
                '&unifiedOrders=0' +
                '&startIndex=%(startOrderPos)s',
            ],
        }[amazon_order_history_util.getSite()];

        let promises_to_promises = templates.map(
            template => getOrdersForYearAndQueryTemplate(year, template, request_scheduler)
        );

        return Promise.all( promises_to_promises )
        .then( array2_of_promise => {
            let order_promises = [];
            array2_of_promise.forEach( promises => {
                promises.forEach( promise => {
                    order_promises.push(promise);
                });
            });
            return order_promises;
        });
    }

    /* Returns array of Order Promise */
    function getOrdersByYear(years, request_scheduler) {
        // At return time we may not know how many orders there are, only
        // how many years in which orders have been queried for.
        return Promise.all(
            years.map(
                function(year) {
                    return fetchYear(year, request_scheduler);
                }
            )
        ).then(
            array2_of_order_promise => {
                // Flatten the array of arrays of Promise<Order> into
                // an array of Promise<Order>.
                return [].concat.apply(
                    [],
                    array2_of_order_promise
                );
            }
        );
    }


    return {
        create: function(ordersPageElem, request_scheduler) {
            return new Order(ordersPageElem, request_scheduler);
        },
        // Return Array of Order Promise.
        getOrdersByYear: getOrdersByYear
    };
})();

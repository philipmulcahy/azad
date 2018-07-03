/* Copyright(c) 2016 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const amazon_order_history_order = (function() {
    'use strict';

    class OrderTracker  {
        constructor() {
            self.promises_by_id = {};
            self.pending_ids = new Set();
        }

        constructorStarted(order_object) {
        }

        idKnown(id) {
        }

        detailPromiseResolved(id) {
        }

        paymentsPromiseResolved(id) {
        }
    }

    const order_tracker = new OrderTracker();

    function getField(xpath, doc, elem) {
        const valueElem = amazon_order_history_util.findSingleNodeValue(xpath, doc, elem);
        try {
            return valueElem.textContent.trim();
        } catch (_) {
            return '?';
        }
    }

    class Order {
        constructor(ordersPageElem, request_scheduler) {
            this.id = null;
            order_tracker.constructorStarted(this);
            this.date = null;
            this.total = null;
            this.who = null;
            this.detail_promise = null;
            this.items = null;
            this.request_scheduler = request_scheduler;
            this.extractOrder(ordersPageElem);
        }

        extractOrder(elem) {
            const getItems = function(elem) {
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
                const items = {};
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
            order_tracker.idKnown(this.id);
            this.items = getItems(elem);
            this.detail_promise = new Promise(
                function(resolve, reject) {
                    const query = amazon_order_history_util.getOrderDetailUrl(this.id);
                    const event_converter = function(evt) {
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
                                ['Postage', 'Shipping', 'Livraison'].map(
                                    label => sprintf(
                                        '//div[contains(@id,"od-subtotals")]//' +
                                        'span[contains(text(),"%s")]/' +
                                        'parent::div/following-sibling::div/span',
                                        label
                                    )
                                ).join('|'),
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
                                ['VAT', 'tax', 'TVA'].map(
                                    label => sprintf(
                                        '//div[contains(@id,"od-subtotals")]//' +
                                        'span[contains(text(),"%s") and not(contains(.,"Before"))]/' +
                                        'parent::div/following-sibling::div/span',
                                        label
                                    )
                                ).join('|'),
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
                                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                                'span[contains(text(),"VAT")]/' +
                                'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            if( a !== null ) {
                                const c = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( c !== null ) {
                                    return c[1];
                                }
                            }
                            return "N/A";
                        }.bind(this);

                        const cad_gst = function() {
                            let a = getField(
                                ['GST', 'HST'].map(
                                    label => sprintf(
                                        '//div[contains(@id,"od-subtotals")]//' +
                                        'span[contains(text(),"%s") and not(contains(.,"Before"))]/' +
                                        'parent::div/following-sibling::div/span',
                                        label
                                    )
                                ).join('|'),
                                doc,
                                doc.documentElement
                            );
                            if( a !== "?") {
                                return a;
                            }
                            a = getField(
                                '//*[text()[contains(.,"GST") and not(contains(.,"Before"))]]',
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
                                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                                'span[contains(text(),"GST")]/' +
                                'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            if( a !== null ) {
                                const c = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( c !== null ) {
                                    return c[1];
                                }
                            }
                            return "N/A";
                        }.bind(this);

                        const cad_pst = function(){
                            let a = getField(
                                ['PST', 'RST', 'QST'].map(
                                    label => sprintf(
                                        '//div[contains(@id,"od-subtotals")]//' +
                                        'span[contains(text(),"%s") and not(contains(.,"Before"))]/' +
                                        'parent::div/following-sibling::div/span',
                                        label
                                    )
                                ).join('|'),
                                doc,
                                doc.documentElement
                            );
                            if( a !== "?") {
                                return a;
                            }
                            a = getField(
                                '//*[text()[contains(.,"PST") and not(contains(.,"Before"))]]',
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
                                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                                'span[contains(text(),"PST")]/' +
                                'parent::div/following-sibling::div/span',
                                doc,
                                doc.documentElement
                            );
                            if( a !== null ) {
                                const c = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( c !== null ) {
                                    return c[1];
                                }
                            }
                            return "N/A";
                        }.bind(this);
                        const refund = function () {
                            let a = getField(
                                ['Refund'].map( //TODO other field names?
                                    label => sprintf(
                                        '//div[contains(@id,"od-subtotals")]//' +
                                        'span[contains(text(),"%s")]/' +
                                        'ancestor::div[1]/following-sibling::div/span',
                                        label
                                    )
                                ).join('|'),
                                doc,
                                doc.documentElement
                            );
                            if (a !== "?") {
                                return a;
                            }
                            return "N/A";
                        }.bind(this);
                        resolve({
                            postage: postage(),
                            gift: gift(),
                            vat: vat(),
                            gst: cad_gst(),
                            pst: cad_pst(),
                            refund: refund()
                        });
                    }.bind(this);
                    this.request_scheduler.schedule(
                        query,
                        event_converter,
                        order_details => {
                            order_tracker.detailPromiseResolved(this.id);
                            resolve(order_details);
                        },
                        this.id
                    );
                }.bind(this)
            );
            this.payments_promise = new Promise(
                function(resolve, reject) {
                    if (this.id.startsWith("D")) {
                        order_tracker.paymentsPromiseResolved(this.id);
                        resolve([ this.date + ": " + this.total]);
                    } else {
                        const query = amazon_order_history_util.getOrderPaymentUrl(this.id);
                        const event_converter = function(evt) {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(
                                evt.target.responseText, "text/html"
                            );
                            const payments = amazon_order_history_util.findMultipleNodeValues(
                                [
                                    'Credit Card transactions',
                                    'Transactions de carte de crédit'
                                ].map(
                                    label => sprintf(
                                        '//b[contains(text(),"%s")]/' +
                                        '../../..//td[contains(text(),":")]/..',
                                        label
                                    )
                                ).join('|'),
                                doc,
                                doc
                            ).map(function(row){
                                return row.textContent
                                          .replace(/[\n\r]/g, ' ')
                                          .replace(/  */g, '\xa0')  //&nbsp;
                                          .trim();
                            });
                            return payments;
                        }.bind(this);
                        this.request_scheduler.schedule(
                            query,
                            event_converter,
                            payments => {
                                order_tracker.paymentsPromiseResolved(this.id);
                                resolve(payments);
                            },
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
        const order_promises = [];
        const sendGetOrderCount = function() {
            request_scheduler.schedule(
                generateQueryString(0),
                convertOrdersPage,
                receiveOrdersCount,
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
        const convertOrdersPage = function(evt) {
            const p = new DOMParser();
            const d = p.parseFromString(evt.target.responseText, 'text/html');
            const countSpan = amazon_order_history_util.findSingleNodeValue(
                './/span[@class="num-orders"]', d, d);
            expected_order_count = parseInt(
                countSpan.textContent.split(' ')[0], 10);
            console.log(
                'Found ' + expected_order_count + ' orders for ' + year
            );
            if(isNaN(expected_order_count)) {
                console.warn(
                    'Error: cannot find order count in ' + countSpan.textContent
                );
            }
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
            const order_elems = amazon_order_history_util.findMultipleNodeValues(
                './/*[contains(concat(" ", ' +
                    'normalize-space(@class), ' +
                    '" "), ' +
                    '" order ")]',
                d,
                ordersElem
            );
            order_elems.forEach(elem => Object.freeze(elem));
            return {
                expected_order_count: expected_order_count,
                order_elems: order_elems,
            };
        };
        const receiveOrdersCount = function(orders_page_data) {
            expected_order_count = orders_page_data.expected_order_count;
            check_complete_callback();
            // TODO: restore efficiency - the first ten orders are visible in the page we got expected_order_count from.
            for(let iorder = 0; iorder < expected_order_count; iorder += 10) {
                console.log(
                    'sending request for order: ' + iorder + ' onwards'
                );
                request_scheduler.schedule(
                    generateQueryString(iorder),
                    convertOrdersPage,
                    receiveOrdersPageData,
                    '2'
                );
            }
        };
        const receiveOrdersPageData = function(orders_page_data) {
            const order_elems = orders_page_data.order_elems;
            function makeOrderPromise(elem) {
                const order = amazon_order_history_order.create(elem, request_scheduler);
                return Promise.resolve(order);
            }
            order_elems.forEach(
                elem => order_found_callback( makeOrderPromise(elem) )
            );
        };

        // Promise to array of Order Promise.
        return new Promise(
            (resolve, reject) => {
                check_complete_callback = function() {
                    console.log('check_complete_callback() actual:' + order_promises.length + ' expected:' + expected_order_count);
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
                        'YearFetcher(' + year + ') order_promises.length:' +
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
        const templates = {
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

        const promises_to_promises = templates.map(
            template => getOrdersForYearAndQueryTemplate(year, template, request_scheduler)
        );

        return Promise.all( promises_to_promises )
        .then( array2_of_promise => {
            const order_promises = [];
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

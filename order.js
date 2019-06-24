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

    function getField(xpath, elem) {
        const valueElem = amazon_order_history_util.findSingleNodeValue(
			xpath, elem
		);
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
                    elem
                );
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
            if(!doc) {
                console.warn('TODO - get rid of these');
            }
            this.date = date.normalizeDateString(
                getField(
                    ['Commande effectuée', 'Order placed', 'Ordine effettuato', 'Pedido realizado'].map(
                        label => sprintf(
                            './/div[contains(span,"%s")]' +
                            '/../div/span[contains(@class,"value")]',
                            label
                        )
                    ).join('|'),
                    elem
                )
            );
            // This field is no longer always available, particularly for .com
            // We replace it (where we know the search pattern for the country) 
            // with information from the order detail page.
            this.total = getField('.//div[contains(span,"Total")]' +
                '/../div/span[contains(@class,"value")]', elem);
            this.who = getField('.//div[contains(@class,"recipient")]' +
                '//span[@class="trigger-text"]', elem);
            if (this.who === '?') {
                this.who = 'N/A';
            }
            this.id = getField(
                ['Order #', 'commande', 'Ordine #', 'Pedido n.º'].map(
                    label => sprintf(
                        './/div[contains(@class,"a-row")]' +
                        '[span[contains(@class,"label")]]' +
                        '[span[contains(@class,"value")]]' +
                        '[contains(span,"%s")]' +
                        '/span[contains(@class,"value")]',
                        label
                    )
                ).join(' | '),
                elem
            );
            if (this.id =='?') {
                this.id = amazon_order_history_util.findSingleNodeValue(
                    '//a[contains(@class, "a-button-text") and contains(@href, "orderID=")]/text()[normalize-space(.)="Order details"]/parent::*',
                    elem
                ).getAttribute('href').match(/.*orderID=([^?]*)/)[1];
            }
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
                        const order_date = function(){
                            let a = amazon_order_history_extraction.by_regex(
                                '//*[contains(@class,"order-date-invoice-item")]/text()',
                                /Ordered on (.*)/,
                                doc.documentElement
                            );
                            if (a) {
                                return date.normalizeDateString(a);
                            }
                            a = amazon_order_history_extraction.by_regex(
                                '//*[contains(@class, "orderSummary")]//*[contains(text(), "Digital Order: ")]/text()',
                                /Digital Order: (.*)/,
                                doc.documentElement
                            );
                            if (a) {
                                return date.normalizeDateString(a);
                            }
                            // fall back
                            return this.date;
                        }.bind(this);
                        const total = function(){
                            return amazon_order_history_extraction.best_match(
                                [
                                    '//div[contains(@id,"od-subtotals")]//' +
                                    '*[contains(text(),"Grand Total") ' + 
                                    'or contains(text(),"Montant total TTC")' +
                                    'or contains(text(),"Total général du paiement")' +
                                    ']/parent::div/following-sibling::div/span',

                                    '//*[contains(text(),"Grand Total:") ' + 
                                    'or contains(text(),"Total for this order:")' +
                                    'or contains(text(),"Montant total TTC:")' +
                                    'or contains(text(),"Total général du paiement:")' +
                                    ']',
                                ],
                                this.total,
                                doc.documentElement
                            ).replace(/.*: /, '').replace('-', '');
                        }.bind(this);
                        const gift = function(){
                            const a = amazon_order_history_extraction.best_match(
                                [
                                    '//div[contains(@id,"od-subtotals")]//' +
                                    'span[contains(text(),"Gift") or contains(text(),"Importo Buono Regalo")]/' +
                                    'parent::div/following-sibling::div/span',
                                
                                    '//*[text()[contains(.,"Gift Certificate")]]',

                                    '//*[text()[contains(.,"Gift Card")]]',
                                ],
                                null,
                                doc.documentElement
                            );
                            if (a !== null) {
                                const b = a.match(
                                    /Gift (?:Certificate|Card) Amount: *([$£€0-9.]*)/);
                                if( b !== null ) {
                                    return b[1];
                                }
                                if (/\d/.test(a)) {
                                    return a.replace('-', '');
                                }
                            }
                            return 'N/A';
                        }.bind(this);
                        const postage = function() {
                            return amazon_order_history_extraction.best_match(
                                [
                                    ['Postage', 'Shipping', 'Livraison', 'Delivery', 'Costi di spedizione'].map(
                                        label => sprintf(
                                            '//div[contains(@id,"od-subtotals")]//' +
                                            'span[contains(text(),"%s")]/' +
                                            'parent::div/following-sibling::div/span',
                                            label
                                        )
                                    ).join('|')
                                ],
                                'N/A',
                                doc.documentElement
                            );
                        }.bind(this);
                        const vat = function(){
                            const a = amazon_order_history_extraction.best_match(
                                [
                                    ['VAT', 'tax', 'TVA', 'IVA'].map(
                                        label => sprintf(
                                            '//div[contains(@id,"od-subtotals")]//' +
                                            'span[contains(text(),"%s") ' +
                                            'and not(contains(text(),"Before") or contains(text(), "esclusa") ' +
                                            ')]/' +
                                            'parent::div/following-sibling::div/span',
                                            label
                                        )
                                    ).join('|'),
                                    ['VAT', 'tax', 'TVA', 'IVA'].map(
                                        label => sprintf(
                                            '//div[contains(@id,"od-subtotals")]//' +
                                            'span[contains(text(),"%s") ' +
                                            'and not(contains(text(),"Before") or contains(text(), "esclusa") ' +
                                            ')]/' +
                                            'parent::div/following-sibling::div/span',
                                            label
                                        )
                                    ).join('|'),
                                    '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                                    'span[contains(text(),"VAT")]/' +
                                    'parent::div/following-sibling::div/span',

                                    '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(., "Vat: ")]]',
                                ],
                                'N/A',
                                doc.documentElement
                            );
                            if( a != null ) {
                                const b = a.match(
                                    /VAT: *([-$£€0-9.]*)/i
                                );
                                if( b !== null ) {
                                    return b[1];
                                }
                            }
                            return a;
                        }.bind(this);
                        const us_tax = function(){
                            let a = amazon_order_history_extraction.by_regex(
                                '//div[contains(@id,"od-subtotals")]//' +
                                'span[contains(text(),"tax") ' +
                                'and not(contains(text(),"before") ' +
                                ')]/' +
                                'parent::div/following-sibling::div/span',
                                /.*/,
                                doc.documentElement
                            );
                            if (a) {
                                return a;
                            }
                            a = amazon_order_history_extraction.by_regex(
                                '//*[text()[contains(.,"tax") and not(contains(.,"before"))]]',
                                /VAT: *([-$£€0-9.]*)/,
                                doc.documentElement
                            );
                            if (a) {
                                return a;
                            }
                            a = amazon_order_history_extraction.by_regex(
                                '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
                                'span[contains(text(),"tax")]/' +
                                'parent::div/following-sibling::div/span',
                                /tax: *([-$£€0-9.]*)/,
                                doc.documentElement
                            );
                            if (a) {
                                return a;
                            }
                            a = amazon_order_history_extraction.by_regex(
                                '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(., "Tax Collected: ")]]',
                                /Tax Collected: *([-$£€0-9.]*)/,
                                doc.documentElement
                            );
                            if (a) {
                                return a;
                            }
                            a = amazon_order_history_extraction.by_regex(
                                '//*[contains(text(), "tax to be collected")]/parent::*/following-sibling::*/descendant::*/text()',
                                /(.*)/,
                                doc.documentElement
                            );
                            if (a) {
                                return a;
                            }
                            return 'N/A';
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
                                doc.documentElement
                            );
                            if( a !== '?') {
                                return a;
                            }
                            a = getField(
                                '//*[text()[contains(.,"GST") and not(contains(.,"Before"))]]',
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
                                doc.documentElement
                            );
                            if( a !== null ) {
                                const c = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( c !== null ) {
                                    return c[1];
                                }
                            }
                            return 'N/A';
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
                                doc.documentElement
                            );
                            if( a !== '?') {
                                return a;
                            }
                            a = getField(
                                '//*[text()[contains(.,"PST") and not(contains(.,"Before"))]]',
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
                                doc.documentElement
                            );
                            if( a !== null ) {
                                const c = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( c !== null ) {
                                    return c[1];
                                }
                            }
                            return 'N/A';
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
                                doc.documentElement
                            );
                            if (a !== '?') {
                                return a;
                            }
                            return 'N/A';
                        }.bind(this);
                        return {
                            date: order_date(),
                            total: total(),
                            postage: postage(),
                            gift: gift(),
                            us_tax: us_tax(),
                            vat: vat(),
                            gst: cad_gst(),
                            pst: cad_pst(),
                            refund: refund()
                        };
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
                            const payments = amazon_order_history_extraction.payments_from_invoice(doc);
                            // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
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

    function getOrdersForYearAndQueryTemplate(
        year,
        query_template,
        request_scheduler,
        nocache_top_level
    ) {
        let expected_order_count = null;
        let order_found_callback = null;
        let check_complete_callback = null;
        const order_promises = [];
        const sendGetOrderCount = function() {
            request_scheduler.schedule(
                generateQueryString(0),
                convertOrdersPage,
                receiveOrdersCount,
                '00000',
                nocache_top_level
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
                './/span[@class="num-orders"]', d.documentElement);
            if (countSpan === null) {
                console.warn(
                    'Error: cannot find order count elem in: ' + evt.target.responseText
                );
            }
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
                ordersElem
            );
            return {
                expected_order_count: expected_order_count,
                order_elems: order_elems.map( elem => dom2json.toJSON(elem) ),
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
            const order_elems = orders_page_data.order_elems.map(
				elem => dom2json.toDOM(elem)
		);
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

    function fetchYear(year, request_scheduler, nocache_top_level) {
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
           'www.amazon.com.au': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s'],				
            'smile.amazon.de': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s' +
                '&language=en_GB'],
            'www.amazon.de': ['https://%(site)s/gp/css/order-history' +
                '?opt=ab&digitalOrders=1' +
                '&unifiedOrders=1' +
                '&returnTo=' +
                '&orderFilter=year-%(year)s' +
                '&startIndex=%(startOrderPos)s' +
                '&language=en_GB'],
            'www.amazon.es': ['https://%(site)s/gp/css/order-history' +
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
            template => getOrdersForYearAndQueryTemplate(
                year,
                template,
                request_scheduler,
                nocache_top_level
            )
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
    function getOrdersByYear(years, request_scheduler, latest_year) {
        // At return time we may not know how many orders there are, only
        // how many years in which orders have been queried for.
        return Promise.all(
            years.map(
                function(year) {
                    const nocache_top_level = (year == latest_year);
                    return fetchYear(year, request_scheduler, nocache_top_level);
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

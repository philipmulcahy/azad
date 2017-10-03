/* Copyright(c) 2016 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

var amazon_order_history_order = (function() {
    "use strict";
    function getField(xpath, elem) {
        var valueElem = elem.ownerDocument.evaluate(
            xpath,
            elem,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        try {
            return valueElem.textContent.trim();
        } catch (_) {
            return "?";
        }
    }

    class Order {
        constructor(ordersPageElem) {
            this.id = null;
            this.date = null;
            this.total = null;
            this.who = null;
            this.detail_promise = null;
            this.items = null;
            this.extractOrder(ordersPageElem);
        }

        extractOrder(elem) {
            var getItems = function(elem) {
                var items = {};
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
                var itemResult = elem.ownerDocument.evaluate(
                    ".//div[@class=\"a-row\"]/a[@class=\"a-link-normal\"][contains(@href,\"/gp/product/\")]",
                    elem,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );
                var i;
                var item;
                var name;
                var link;
                for(i = 0; i !== itemResult.snapshotLength; i += 1) {
                    item = itemResult.snapshotItem(i);
                    name = item.innerText.trim();
                    link = item.getAttribute("href");
                    items[name] = link;
                }
                return items;
            };
            this.date = getField(".//div[contains(span,\"Order placed\")]" +
                "/../div/span[contains(@class,\"value\")]", elem);
            this.total = getField(".//div[contains(span,\"Total\")]" +
                "/../div/span[contains(@class,\"value\")]", elem);
            this.who = getField(".//div[contains(@class,\"recipient\")]" +
                "//span[@class=\"trigger-text\"]", elem);
            if (this.who === "?") {
                this.who = "N/A";
            }
            this.id = getField(".//div[contains(@class,\"a-row\")]" +
                "[span[contains(@class,\"label\")]]" +
                    "[span[contains(@class,\"value\")]]" +
                    "[contains(span,\"Order #\")]" +
                    "/span[contains(@class,\"value\")]", elem);
            this.items = getItems(elem);
            this.detail_promise = new Promise(
                function(resolve, reject) {
                    var req = new XMLHttpRequest();
                    var query = amazon_order_history_util.getOrderDetailUrl(this.id);
                    req.open("GET", query, true);
                    req.onload = function(evt) {
                        var parser = new DOMParser();
                        var doc = parser.parseFromString(
                            evt.target.responseText, "text/html"
                        );
                        var gift = function(){
                            var a = getField(
                                "//div[contains(@id,\"od-subtotals\")]//" +
                                "span[contains(text(),\"Gift\")]/" +
                                    "parent::div/following-sibling::div/span",
                                doc.documentElement
                            );
                            if( a !== "?") {
                                return a.replace('-', '');
                            }
                            a = getField(
                                "//*[text()[contains(.,\"Gift Certificate\")]]",
                                doc.documentElement
                            );
                            if( a !== null ) {
                                var b = a.match(
                                    /Gift Certificate.Card Amount: *([$£€0-9.]*)/);
                                if( b !== null ) {
                                    return b[1];
                                }
                            }
                            a = getField(
                                "//*[text()[contains(.,\"Gift Card\")]]",
                                doc.documentElement
                            );
                            if( a !== null ) {
                                var b = a.match(
                                    /Gift Card Amount: *([$£€0-9.]*)/);
                                if( b !== null ) {
                                    return b[1];
                                }
                            }
                            return "N/A";
                        }.bind(this);
                        var postage = function() {
                            var a = getField(
                                "//div[contains(@id,\"od-subtotals\")]//" +
                                "span[contains(text(),\"Postage\")]/" +
                                    "parent::div/following-sibling::div/span",
                                doc.documentElement
                            );
                            if (a !== "?") {
                                return a;
                            }
                            a = getField(
                                "//div[contains(@id,\"od-subtotals\")]//" +
                                "span[contains(text(),\"Shipping\")]/" +
                                    "parent::div/following-sibling::div/span",
                                doc.documentElement
                            );
                            if (a !== "?") {
                                return a;
                            }
                            return "N/A";
                        }.bind(this);
                        var vat = function(){
                            var a = getField(
                                "//div[contains(@id,\"od-subtotals\")]//" +
                                "span[contains(text(),\"VAT\") and not(contains(.,\"Before\"))]/" +
                                    "parent::div/following-sibling::div/span",
                                doc.documentElement
                            );
                            if( a !== "?") {
                                return a;
                            }
                            a = getField(
                                "//div[contains(@id,\"od-subtotals\")]//" +
                                "span[contains(text(),\"tax\") and not(contains(.,\"before\"))]/" +
                                    "parent::div/following-sibling::div/span",
                                doc.documentElement
                            );
                            if( a !== "?") {
                                return a;
                            }
                            a = getField(
                                "//*[text()[contains(.,\"VAT\") and not(contains(.,\"Before\"))]]",
                                doc.documentElement
                            );
                            if( a !== null ) {
                                var b = a.match(
                                    /VAT: *([-$£€0-9.]*)/);
                                if( b !== null ) {
                                    return b[1];
                                }
                            }
                            a = getField(
                                "//div[contains(@class,\"a-row pmts-summary-preview-single-item-amount\")]//span[contains(text(),\"VAT\")]/parent::div/following-sibling::div/span",
                                doc.documentElement);
                            if( a !== null ) {
                                var c = a.match(
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
                    req.send();
                }.bind(this)
            );
        }

        /**
         * Creates an html element suitable for embedding into a table cell
         * but doesn't actually embed it.
         * @param {document} doc. DOM document needed to create elements.
         */
        itemsHtml(doc) {
            var title;
            var ul = doc.createElement("ul");
            var li;
            var a;
            for(title in this.items) {
                if(this.items.hasOwnProperty(title)) {
                    li = doc.createElement("li");
                    ul.appendChild(li);
                    a = doc.createElement("a");
                    li.appendChild(a);
                    a.textContent = title;
                    a.href = this.items[title];
                }
            }
            return ul;
        }
    }

    return {
        create: function(ordersPageElem) {
            return new Order(ordersPageElem);
        }
    };
})();

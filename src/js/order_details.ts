/* Copyright(c) 2023 Philip Mulcahy. */

import * as date from './date';
import * as extraction from './extraction';
import * as item from './item';
import * as order_header from './order_header';
import * as payment from './payment';
import * as req from './request';
import * as request_scheduler from './request_scheduler';
import * as shipment from './shipment';
import * as sprintf from 'sprintf-js';
import * as util from './util';

export interface IOrderDetails {
  date: Date|null;
  total: string;
  postage: string;
  postage_refund: string;
  gift: string;
  us_tax: string;
  vat: string;
  gst: string;
  pst: string;
  subscribe_and_save: string;  // discount
  refund: string;
  who: string;
  invoice_url: string;
  payments: string[];  // this is not the only source of payment information.
}

export interface IOrderDetailsAndItems {
  details: IOrderDetails;
  items: item.IItem[];
  shipments: shipment.IShipment[];
}

export async function extractDetailPromise(
  header: order_header.IOrderHeader,
  scheduler: request_scheduler.IRequestScheduler,
): Promise<IOrderDetailsAndItems> {
  const context = 'id:' + header.id;
  const url = header.detail_url;
  if(!url) {
    const msg = 'null order detail query: cannot schedule';
    console.error(msg);
    throw(msg);
  }

  async function event_converter(
    evt: req.Event
  ): Promise<IOrderDetailsAndItems> {
    const doc = util.parseStringToDOM( evt.target.responseText );
    const url = evt.target.responseURL;
    const shipments = await shipment.get_shipments(
      doc, url, header, context, scheduler, header.site);
    shipments.forEach(
      s => console.log('shipment: ' + s.toString()));
    return {
      details: extractDetailFromDoc(header, doc),
      items: await get_items(
        header,
        doc.documentElement,
        shipments,
        scheduler,
        context),
      shipments: shipments,
    };
  }

  const debug_context = 'order_detail';

  try {
    const details_promise = req.makeAsyncStaticRequest(
      url,
      'extractDetailPromise',
      event_converter,
      scheduler,
      util.defaulted(header.id, '9999'),
      false,  // nocache=false: cached response is acceptable
      debug_context,
    );
    return details_promise;
  } catch (url) {
    const msg = 'scheduler synchronously rejected ' + header.id + ' ' + url;
    console.error(msg);
    throw('synchronous timeout or other problem when fetching ' + url);
  }
}

async function get_items(
  header: order_header.IOrderHeader,
  order_detail_page_elem: HTMLElement,
  shipments: shipment.IShipment[],
  scheduler: request_scheduler.IRequestScheduler,
  context: string,
): Promise<item.IItem[]> {
  let items: item.IItem[] = [];
  if ( shipments.length != 0 ) {
    items = shipments.map(s => s.items).flat();
  }
  if ( items.length == 0 ) {
    // Try the "legacy" item extraction strategy.
    items = await item.extractItems(
      order_detail_page_elem,
      header,
      scheduler,
      context,
    );
  }
  return items;
}

function extractDetailFromDoc(
  header: order_header.IOrderHeader,
  doc: HTMLDocument,
): IOrderDetails {
  const context = 'id:' + header.id;
  const who = function(): string {
    if(header.who && header.who != '') {
      return header.who;
    }

    const doc_elem = doc.documentElement;

    const x = extraction.getField2(
      [
        // Physical orders 2025.
        './/*[contains(@class,"displayAddressFullName")]',

        // .com physical orders 2025.
        './/div[@data-component="shippingAddress"]/ul/li[1]',

        // TODO: seems brittle, depending on the precise path of the element.
        // US Digital.
        './/table[contains(@class,"sample")]/tbody/tr/td/div/text()[2]',

        './/div[contains(@class,"recipient")]//span[@class="trigger-text"]',
        './/div[contains(text(),"Recipient")]',
        './/li[contains(@class,"displayAddressFullName")]/text()',
      ],
      doc_elem,
      '',  // default value
      context,
    ).trim();

    return x;
  };

  const order_date: Date|null = function(): Date|null {
    const def_string = (header.date && !isNaN(header.date.getDate())) ?
      date.dateToDateIsoString(header.date):
      null;
    const d = extraction.by_regex(
      [
          '//*[contains(@class,"order-date-invoice-item")]/text()',
          '//*[contains(@class, "orderSummary")]//*[contains(text(), "Digital Order: ")]/text()',
      ],
      /(?:Ordered on|Commandé le|Digital Order:) (.*)/i,
      def_string,
      doc.documentElement,
      context,
    );
    if (d) {
      return new Date(date.normalizeDateString(d));
    }
    return util.defaulted(header.date, null);
  }();

  const total: string = function(): string {
    const a = extraction.by_regex(
      [
        '//span[@class="a-color-price a-text-bold"]/text()',

        '//b[contains(text(),"Total for this Order")]/text()',

        '//span[contains(@id,"grand-total-amount")]/text()',

        '//div[contains(@id,"od-subtotals")]//' +
        '*[.//text()[contains(.,"Grand Total")] ' +
        'or .//text()[contains(.,"Montant total TTC")]' +
        'or .//text()[contains(.,"Total général du paiement")]' +
        ']/parent::div/following-sibling::div/span',

        '//span[contains(text(),"Grand Total:")]' +
        '/parent::*/parent::*/div/span[' +
        'contains(text(), "$") or ' +
        'contains(text(), "£") or ' +
        'contains(text(), "€") or ' +
        'contains(text(), "AUD") or ' +
        'contains(text(), "CAD") or ' +
        'contains(text(), "GBP") or ' +
        'contains(text(), "USD") ' +
        ']/parent::*/parent::*',

        '//*[contains(text(),"Grand total:") ' +
        'or  contains(text(),"Grand Total:") ' +
        'or  contains(text(),"Total general:")' +
        'or  contains(text(),"Total for this order:")' +
        'or  contains(text(),"Total of this order:")' +
        'or  contains(text(),"Total de este pedido:")' +
        'or  contains(text(),"Total del pedido:")' +
        'or  contains(text(),"Montant total TTC:")' +
        'or  contains(text(),"Total général du paiement:")' +
        ']',
      ],
      null,
      header.total,
      doc.documentElement,
      context,
    );
    if (a) {
      return a.replace(/^.*:/, '')
              .replace(/[\n\t ]/g, '')  // whitespace
              .replace('-', '');
    }
    return util.defaulted(a, '');
  }();

  // TODO Need to exclude gift wrap
  const gift = function(): string {
    const a = extraction.by_regex(
      [
        '//div[contains(@id,"od-subtotals")]//' +
        'span[.//text()[(contains(.,"Gift") or contains(.,"Importo Buono Regalo")) and not(contains(., "wrap"))]]' +
        'parent::div/following-sibling::div/span',

        '//span[contains(@id, "giftCardAmount-amount")]/text()', // Whole foods or Amazon Fresh.

        '//*[text()[contains(.,"Gift Certificate")]]',

        '//*[text()[contains(.,"Gift Card")]]',
      ],
      null,
      null,
      doc.documentElement,
      context,
    );
    if ( a ) {
      const b = a.match(
        /Gift (?:Certificate|Card) Amount: *-?([$£€0-9.]*)/i);
      if( b !== null ) {
        return b[1];
      }
      if (/\d/.test(a)) {
        return a.replace('-', '');
      }
    }
    return '';
  };

  const postage = function(): string {
    return util.defaulted(
      extraction.by_regex(
        [
          ['Postage', 'Shipping', 'Livraison', 'Delivery', 'Costi di spedizione'].map(
            label => sprintf.sprintf(
              '//div[contains(@id,"od-subtotals")]//' +
              'span[.//text()[contains(.,"%s")]]/' +
              'parent::div/following-sibling::div/span',
              label
            )
          ).join('|')
        ],
        null,
        null,
        doc.documentElement,
        context,
      ),
      ''
    );
  };

  const postage_refund = function(): string {
    return util.defaulted(
      extraction.by_regex(
        [
          ['FREE Shipping'].map(
            label => sprintf.sprintf(
              '//div[contains(@id,"od-subtotals")]//' +
              'span[.//text()[contains(.,"%s")]]/' +
              'parent::div/following-sibling::div/span',
              label
            )
          ).join('|')
        ],
        null,
        null,
        doc.documentElement,
        context,
      ),
      ''
    );
  };

  const subscribe_and_save = function(): string {
    let a = extraction.by_regex(
      [
        '//span[contains(text(), "Subscribe & Save:")]/../following-sibling::div/span/text()'
      ],
      util.moneyRegEx(),
      null,
      doc.documentElement,
      context,
    );
    if ( !a ) {
      a = null;
    }
    return util.defaulted(a, '');
  }

  const vat = function(): string {
    const vat_words = ['VAT', 'tax', 'TVA', 'IVA'];
    const strategy0 = function(): string {
      const xpaths = vat_words.map(
        label =>
          '//div[contains(@id,"od-subtotals")]//' +
          'span[contains(text(),"' + label + '") ' +
          'and not(contains(text(),"before") or contains(text(),"Before") or contains(text(),"esclusa") ' +
          ')]/' +
          'parent::div/following-sibling::div/span'
      ).concat(
        [
          '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//' +
          'span[contains(text(),"VAT")]/' +
          'parent::div/following-sibling::div/span',

          '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(.,"VAT: ")]]',
          '//div[contains(@class, "orderSummary")]//*[text()[contains(.,"VAT: ")]]'
        ]
      );
      const a = extraction.by_regex(
        xpaths,
        null,
        null,
        doc.documentElement,
        context,
      );
      if( a != null ) {
        const b = a.match( new RegExp('VAT:' + util.moneyRegEx().source, 'i') );
        if( b !== null ) {
          return b[1];
        }
      }
      return util.defaulted(a, '');
    };

    const strategy1 = () => extraction.by_regex(
      [
        vat_words.map(
          label => sprintf.sprintf(
            '//div[contains(@id,"od-subtotals")]//' +
            'span[.//text()[starts-with(.,"%s")]]/' +
            'parent::div/following-sibling::div/span',
            label
          )
        ).join('|')
      ],
      null,
      null,
      doc.documentElement,
      context,
    );
  
    return extraction.firstMatchingStrategy(
      [strategy0, strategy1],
      ''
    );
  };

  const us_tax = function(): string {
    let a = extraction.by_regex(
      [
        '//div[text() = "Tax Collected:"]/following-sibling::div/text()',
        '//span[.//text()[contains(.,"Estimated tax to be collected:")]]/../../div[2]/span/text()',
        '//span[contains(@id, "totalTax-amount")]/text()',
      ],
      util.moneyRegEx(),
      '',
      doc.documentElement,
      context,
    );

    if ( !a ) {
      a = extraction.getField2(
        ['.//tr[contains(td,"Tax Collected:")]'],
        doc.documentElement,
        '',
        context,
      );

      if (a) {
        // Result
        // 0: "Tax Collected: USD $0.00"
        // 1: "USD $0.00"
        // 2:   "USD"
        // 3:   "$0.00"
        // 4:     "$"
        // 5:     "0.00"
        try {
          // @ts-ignore stop complaining: you're in a try block!
          a = a.match(util.moneyRegEx())[1];
        } catch {
          a = null;
        }
      } else {
        a = null;
      }
    }
    return util.defaulted(a, '');
  };

  const cad_gst = function(): string {
    const a = extraction.by_regex(
      [
        ['GST', 'HST'].map(
          label => sprintf.sprintf(
            '//div[contains(@id,"od-subtotals")]//span[contains(text(),"%s") and not(contains(.,"Before"))]/ancestor::div[position()=1]/following-sibling::div/span',
            label
          )
        ).join('|'),
        '//*[text()[contains(.,"GST") and not(contains(.,"Before"))]]',
        '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//span[contains(text(),"GST")]/parent::div/following-sibling::div/span',
      ],
      util.moneyRegEx(),
      null,
      doc.documentElement,
      context,
    );
    return util.defaulted(a, '');
  };

  const cad_pst = function(): string {
    const a = extraction.by_regex(
      [
        ['PST', 'RST', 'QST'].map(
          label => sprintf.sprintf(
            '//div[contains(@id,"od-subtotals")]//span[contains(text(),"%s") and not(contains(.,"Before"))]/ancestor::div[position()=1]/following-sibling::div/span',
            label
          )
        ).join('|'),
        '//*[text()[contains(.,"PST") and not(contains(.,"Before"))]]',
        '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//span[contains(text(),"PST")]/parent::div/following-sibling::div/span',
      ],
      util.moneyRegEx(),
      null,
      doc.documentElement,
      context,
    );
    return util.defaulted(a, '');
  };

  const refund = function(): string {
    const a = extraction.getField2(
      [
        'Refund',
        'Totale rimborso',
      ].map(
        label => sprintf.sprintf(
          '//div[contains(@id,"od-subtotals")]//' +
          'span[.//text()[contains(.,"%s")]]/' +
          'ancestor::div[1]/following-sibling::div/span',
          label
        )
      ),
      doc.documentElement,
      '',  // default
      context,
    );

    return a;
  };

  const invoice_url: string = function(): string {
    const suffix: string|null = getAttribute(
      '//a[contains(@href, "/invoice") or contains(@href, "_invoice")]',
      'href',
      doc.documentElement,
      context,
    );
    if( suffix ) {
      return 'https://' + header.site + suffix;
    }
    return '';
  }();

  const payments = () => payment.paymentsFromDetailPage(
    doc,
    order_date,
    total
  );

  const details: IOrderDetails = {
    date: order_date,
    total: total,
    postage: postage(),
    postage_refund: postage_refund(),
    gift: gift(),
    subscribe_and_save: subscribe_and_save(),
    us_tax: us_tax(),
    vat: vat(),
    gst: cad_gst(),
    pst: cad_pst(),
    refund: refund(),
    who: who(),
    invoice_url: invoice_url,
    payments: payments(),
  };

  return details;
}

function getAttribute(
  xpath: string,
  attribute_name: string,
  elem: HTMLElement,
  context: string,
): string|null {
  try {
    const targetElem = extraction.findSingleNodeValue(xpath, elem, context);
    return (<HTMLElement>targetElem)!.getAttribute(attribute_name);
  } catch (_) {
    return null;
  }
}

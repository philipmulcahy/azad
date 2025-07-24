/* Copyright(c) 2023 Philip Mulcahy. */

import * as date from './date';
import * as extraction from './extraction';
import * as order_details from './order_details';
import * as order_header from './order_header';
import * as pmt from './payment';
import * as req from './request';
import * as request_scheduler from './request_scheduler';
import * as util from './util';

type Payments = string[];

export class OrderImpl {
  header: order_header.IOrderHeader;
  detail_promise: Promise<order_details.IOrderDetailsAndItems>|null;
  payments_promise: Promise<Payments>|null;

  constructor(
    header: order_header.IOrderHeader,
    scheduler: request_scheduler.IRequestScheduler,
    date_filter: date.DateFilter,
  ) {
    this.header = header;
    this.detail_promise = null;
    this.payments_promise = null;
    this._extractOrder(date_filter, scheduler);
  }

  _extractOrder(
    date_filter: date.DateFilter,
    scheduler: request_scheduler.IRequestScheduler
  ) {
    if (!date_filter(this.header.date)) {
      throw new Error("Discarding order due to date filter: " + this.header.id);
    }

    this.detail_promise = order_details.extractDetailPromise(
      this.header,
      scheduler,
    );

    this.payments_promise = this.fetch_payments(
      scheduler,
      this.header.date,
      this.header.total ?? '',
    );
  }

  async fetch_payments(
    scheduler: request_scheduler.IRequestScheduler,
    defaultDate: Date | null,
    defaultAmount: string,
  ): Promise<Payments> {
    if (this.header.id?.startsWith('D')) {
      const d = this.header.date ?
        date.dateToDateIsoString(this.header.date) :
        '';

      return Promise.resolve([
        this.header.total ?
          d + ': ' + this.header.total :
          d
      ]);
    }

    const event_converter = function(evt: any): Payments{
      const invoiceDoc = util.parseStringToDOM( evt.target.responseText );

      const payments = pmt.payments_from_invoice(
        invoiceDoc,
        defaultDate,
        defaultAmount,
      );

      // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
      return payments;
    }.bind(this);

    const url = this.header.payments_url;

    if (!url) {
      throw('cannot fetch payments without payments_url');
    }

    try {
      return await req.makeAsyncStaticRequest<Payments>(
        url,
        'fetch_payments',
        event_converter,
        scheduler,
        util.defaulted(this.header.id, '9999'), // priority
        false,  // nocache,
        'payments for ' + this.header.id,  // debug_context
      );
    } catch (ex) {
      const msg = 'timeout or other error while fetching ' + url +
                  ' for ' + this.header.id + ': ' + ex;

      console.error(msg);
      return [];
    }
  }
}

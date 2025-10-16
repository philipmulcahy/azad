/* Copyright(c) 2023 Philip Mulcahy. */

import * as date from './date';
import * as extraction from './extraction';
import * as order_details from './order_details';
import * as order_header from './order_header';
import * as pmt from './payment';
import * as request_scheduler from './request_scheduler';
import * as util from './util';

export class OrderImpl {
  header: order_header.IOrderHeader;
  detail_promise: Promise<order_details.IOrderDetailsAndItems>|null;
  payments_promise: Promise<pmt.Payments>|null;

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

    this.payments_promise = pmt.fetch_payments(
      scheduler,
      this.header,
    );
  }

}

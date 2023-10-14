/* Copyright(c) 2023 Philip Mulcahy. */

import * as date from './date';
import * as extraction from './extraction';
import * as order_details from './order_details';
import * as order_header from './order_header';
import * as request_scheduler from './request_scheduler';
import * as util from './util';

export class OrderImpl {
  header: order_header.IOrderHeader;
  detail_promise: Promise<order_details.IOrderDetailsAndItems>|null;
  payments_promise: Promise<string[]>|null;

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
    const context = 'id:' + this.header.id;
    if (!date_filter(this.header.date)) {
      throw_order_discarded_error(this.header.id);
    }

    this.detail_promise = order_details.extractDetailPromise(
      this.header, scheduler);
    this.payments_promise = new Promise<string[]>((
      (
        resolve: (payments: string[]) => void,
        reject: (msg: string) => void
      ) => {
        if (this.header.id?.startsWith('D')) {
          const date = this.header.date ?
            util.dateToDateIsoString(this.header.date) :
            '';
          resolve([
            this.header.total ?
              date + ': ' + this.header.total :
              date
          ]);
        } else {
          const event_converter = function(evt: any) {
            const doc = util.parseStringToDOM( evt.target.responseText );
            const payments = extraction.payments_from_invoice(doc);
            // ["American Express ending in 1234: 12 May 2019: £83.58", ...]
            return payments;
          }.bind(this);
          if (this.header.payments_url) {
            scheduler.scheduleToPromise<string[]>(
              this.header.payments_url,
              event_converter,
              util.defaulted(this.header.id, '9999'), // priority
              false,  // nocache,
              'payments for ' + this.header.id,  // debug_context
            ).then(
              (response: {result: string[]}) => {
                resolve(response.result)
              },
              (url: string) => {
                const msg = 'timeout or other error while fetching ' + url +
                            ' for ' + this.header.id;
                console.error(msg);
                reject(msg);
              },
            );
          } else {
            reject('cannot fetch payments without payments_url');
          }
        }
      }
    ).bind(this));
  }
}

function throw_order_discarded_error(order_id: string|null): void {
  const ode = new Error('OrderDiscardedError:' + order_id);
  throw ode;
}


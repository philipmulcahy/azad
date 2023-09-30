/* Copyright(c) 2016-2023 Philip Mulcahy. */

'use strict';

import * as binary_heap from './binary_heap';
import * as cachestuff from './cachestuff';
import * as signin from './signin';
import * as stats from './statistics';
import * as url from './url';

export interface IResponse<T> {
  result: T,
  query: string
}

export type Event = {
  target: {
    responseText: string;
    responseURL: string;
  }
};

export type EventConverter = (evt: Event) => any;

export interface IRequestScheduler {
  scheduleToPromise<T>(
    query: string,
    event_converter: EventConverter,
    priority: string,
    nocache: boolean,
    debug_context: string,
  ): Promise<IResponse<T>>;

  abort(): void;
  clearCache(): void;
  isLive(): boolean;
  purpose(): string;
}

class RequestScheduler {

  // chrome allows 6 requests per domain at the same time.
  CONCURRENCY: number = 6

  cache: cachestuff.Cache = cachestuff.createLocalCache('REQUESTSCHEDULER');
  queue: binary_heap.BinaryHeap = new binary_heap.BinaryHeap(
    (item: any): number => item.priority
  );
  running_count: number = 0;
  completed_count: number = 0
  error_count: number = 0;
  signin_warned: boolean = false;
  live = true;
  _purpose: string;

  constructor(purpose: string) {
    this._purpose = purpose;
    console.log('constructing new RequestScheduler');
    this._update_statistics();
  }

  purpose(): string { return this._purpose; }

  _schedule(
    query: string,
    event_converter: EventConverter,
    success_callback: (results: any, query: string) => void,
    failure_callback: (query: string) => void,
    priority: string,
    nocache: boolean,
    debug_context: string,
  ): void {
    if (!this.live) {
      throw 'scheduler has aborted or finished, and cannot accept more queries';
    }
    console.log('Queuing ' + query + ' with ' + this.queue.size());
    this.queue.push({
      'query': query,
      'event_converter': event_converter,
      'success_callback': success_callback,
      'failure_callback': failure_callback,
      'priority': priority,
      'nocache': nocache,
      'debug_context': debug_context,
    });
    this._executeSomeIfPossible();
  }

  scheduleToPromise<T>(
    query: string,
    event_converter: EventConverter,
    priority: string,
    nocache: boolean,
    debug_context: string,
  ): Promise<IResponse<T>> {
    query = url.normalizeUrl(query, url.getSite());
    console.log(
      'Scheduling ', debug_context, query,
      ' with queue size ', this.queue.size(),
      ' and priority ', priority
    );
    return new Promise<IResponse<T>>(
      (resolve, reject) => {
        try {
          this._schedule(
            query,
            event_converter,
            (result, query) => resolve(
              {result: result, query: query}),
            (query: string) => reject(query),
            priority,
            nocache,
            debug_context,
          );
        } catch(err) {
          reject(query);
        }
      }
    );
  }

  abort() {
    // Prevent (irreversably) this scheduler from doing any more work.
    console.log('RequestScheduler.abort()');
    this.live = false;
  }

  clearCache() {
    this.cache.clear();
  }

  _update_statistics() {
    stats.set('queued', this.queue.size());
    stats.set('running', this.running_count);
    stats.set('completed', this.completed_count);
    stats.set('errors', this.error_count);
    stats.set('cache_hits', this.cache.hitCount());
  }

  isLive() {
    return this.live;
  }

  // Process a single de-queued request either by retrieving from the cache
  // or by sending it out.
  async _execute(
    query: string,
    event_converter: EventConverter,
    success_callback: (converted_event: any, query: string) => void,
    failure_callback: (query: string) => void,
    priority: number,
    nocache: boolean,
    debug_context: string,
  ) {
    if (!this.live) {
      return;
    }
    console.log(
      'Executing', debug_context, query,
      'with queue size', this.queue.size(),
      'and priority', priority
    );

    // Catch any exceptions that the client's callback throws
    // so as to avoid killing the "thread" and thus prevent
    // subsequent responses being handled.
    const protected_callback = async function(
      maybe_promise_response: any,
      query: string
    ): Promise<any> {
      const definitely_promise_response = Promise.resolve(maybe_promise_response);
      const response = await definitely_promise_response;
      console.log(
        'protected_callback', debug_context, query,
        'priority', priority
      );
      try {
        const result = success_callback(response, query);
        return result;
      } catch (ex) {
        console.error(
          'callback failed for ', debug_context, query, ex);
        return null;
      }
    }

    const protected_converter = (evt: any) => {
      try {
        console.log(
          'protected_converter', debug_context, query,
          'queue_size ', this.queue.size(),
          'priority', priority,
          // 'html', evt.target.responseText,
        );
        return event_converter(evt);
      } catch (ex) {
        console.error(
          'event conversion failed for ', debug_context, query, ex);
        return null;
      }
    }

    const cached_response_promise = nocache ?
      Promise.resolve(undefined) :
      this.cache.get(query);

    const cached_response = await cached_response_promise;

    if (typeof(cached_response) !== 'undefined') {
      this._pretendToSendOne(query, protected_callback, cached_response);
    } else {
      this._sendOne(
        query,
        protected_converter,
        protected_callback,
        failure_callback,
        nocache,
        debug_context,
      );
    }
  }

  _pretendToSendOne(
    query: string,
    success_callback: (converted_event: any, query: string) => void,
    cached_response: any
  ) {
    // "Return" results asynchronously...
    // ...make it happen as soon as possible after any current
    // synchronous code has finished - e.g. pretend it's coming back
    // from the internet.
    // Why? Because otherwise the scheduler will get confused about
    // whether it has finished all of its work: the caller of this
    // function may be intending to schedule multiple actions, and if
    // we finish all of the work from the first call before the caller
    // has a chance to tell us about the rest of the work, then the
    // scheduler will shut down by setting this.live to false.
    this._update_statistics();
    setTimeout(
      () => {
        this.running_count -= 1;
        success_callback(cached_response, query);
        this._recordSingleCompletion();
      }
    );
  }

  _recordSingleCompletion() {
    // Defer checking if we're done, because success_callback
    // (triggered above) probably involves a promise chain, and might
    // enqueue more work that might be abandonned if we shut this
    // scheduler down prematurely.
    setTimeout(
      () => {
        this._executeSomeIfPossible();
        this._update_statistics();
        this._checkDone();
      }
    );
  }

  _sendOne(
    url: string,
    event_converter: (evt: any) => any,
    success_callback: (converted_event: any, query: string) => void,
    failure_callback: (query: string) => void,
    nocache: boolean,
    debug_context: string,
  ) {
    const req = new XMLHttpRequest();
    console.log('opening xhr on ' + url);
    req.open('GET', url, true);
    req.onerror = (): void =>  {
      this.running_count -= 1;
      this.error_count += 1;
      if (!signin.checkTooManyRedirects(url, req) ) {
        console.log( 'Unknown error fetching ' + debug_context + ' ' + url );
      }
      failure_callback(url);
      this._recordSingleCompletion();
    };
    req.onload = async (evt: any): Promise<void> => {
      console.log('got response for ', debug_context, url); 
      this.running_count -= 1;
      if (!this.live) {
        this.error_count += 1;
        this._update_statistics();
        return;
      }
      try {
        if (
          req.responseURL.includes('/signin?') || req.status == 404
        ) {
          this.error_count += 1;
          console.log(
            'Got sign-in redirect or 404 from: ',
            debug_context, url, req.status);
          if ( !this.signin_warned ) {
            signin.alertPartiallyLoggedOutAndOpenLoginTab(url);
            this.signin_warned = true;
          }
          failure_callback(url);
        } else if ( req.status != 200 ) {
          this.error_count += 1;
          console.warn('Got HTTP' + req.status + ' fetching ' + url);
          failure_callback(url);
        } else {
          this.completed_count += 1;
          console.log(
            'Finished ', debug_context, url,
            ' with queue size ', this.queue.size());
          const converted = await Promise.resolve(event_converter(evt));
          if (!nocache) {
            this.cache.set(url, converted);
          }
          success_callback(converted, url);
        }
      } catch (ex) {
        failure_callback(url);
        console.error('req handling caught unexpected: ', debug_context, ex);
      }
      this._recordSingleCompletion();
    };
    req.timeout = 20000;  // 20 seconds
    req.ontimeout = (_evt: any): void => {
      this.running_count -= 1;
      this.error_count += 1;
      if (this.live) {
        failure_callback(url);
        this._recordSingleCompletion();
        console.warn('Timed out while fetching: ', debug_context, url);
      }
    }
    this._update_statistics();
    req.send();
  }

  async _executeSomeIfPossible() {
    console.debug(
      '_executeSomeIfPossible: size: ' + this.queue.size() +
      ', running: ' + this.running_count
    );
    while (this.running_count < this.CONCURRENCY &&
      this.queue.size() > 0
    ) {
      const task = this.queue.pop();
      this.running_count += 1;
      const _one_done = await this._execute(
        task.query,
        task.event_converter,
        task.success_callback,
        task.failure_callback,
        task.priority,
        task.nocache,
        task.debug_context,
      );
    }
  }

  _checkDone() {
    console.debug(
      '_checkDone: size: ' + this.queue.size() +
      ', running: ' + this.running_count +
      ', completed: ' + this.completed_count
    );
    if (
      this.queue.size() == 0 &&
      this.running_count == 0 &&
      this.completed_count > 0  // make sure we don't kill a brand-new scheduler
    ) {
      console.log('RequestScheduler._checkDone() succeeded');
      this.live = false;
    }
  }
}

export function create(purpose: string): IRequestScheduler {
  return new RequestScheduler(purpose);
};

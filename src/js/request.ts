/* Copyright(c) 2023 Philip Mulcahy. */

import * as request_scheduler from './request_scheduler';
import * as stats from './statistics';
import * as signin from './signin';
import * as urls from './url';

'use strict';

/*

     [NEW]
       │
       v A
       │
    ENQUEUED
       │
       v B
       │
    DEQUEUED
       │
 ┌─────┼──────┐
 │     │      │
 │     v C    v D
 │     │      │
 │    SENT  CACHE_HIT────────>───────┐
 v L   │                             │
 │     ├─────>────┬──────>─────┐     │
 │     │          │            │     │
 │     v E        │ F          │ G   │
 │     │          │            │     │
 └─RESPONDED  (TIMED_OUT)   (FAILED) │
       │                       │     │
       ├──────────>────────────┘     │
       │                             │
       v H                           │
       │                             │
   CONVERTED                         v I
       │                             │
       v J                           │
       │                             │
       ├─────┐                       │
       │     │                       │
     CACHED  │                       │
       │     │                       │
     K v     v                       │
       │     │                       │
   (SUCCESS)─┴──────────<────────────┘

*/

enum State {
  NEW = 1,
  ENQUEUED,
  DEQUEUED,
  SENT,
  CACHE_HIT,
  RESPONDED,
  TIMED_OUT,
  FAILED,
  CONVERTED,
  CACHED,
  SUCCESS,
}

interface IResponse<T> {
  result: T,
  query: string
}

export type Event = {
  target: {
    responseText: string;
    responseURL: string;
  }
};

export type EventConverter<T> = (evt: Event) => T;

// Embedding this code in AzadRequest.constructor means initialisation order
// nightmares - at least we keep the mess isolated by doing it in a dedicated
// function here.
function make_promise_with_callbacks<T>(): {
  resolve: (t: T)=>void,
  reject: (s: string)=>void,
  promise: Promise<T>,
} {
  let resolve: (t: T)=>void = (_t)=>{};
  let reject: (s: string)=>void = (_s)=>{};
  const promise: Promise<T> = new Promise<T>( (res, rej) => {
    resolve = res;
    reject= rej;
  });
  return {
    resolve: resolve,
    reject: reject,
    promise: promise,
  }
}

class AzadRequest<T> {
  _state: State = State.NEW;
  _url: string;
  _event_converter: EventConverter<T>;
  _scheduler: request_scheduler.IRequestScheduler;
  _priority: string;
  _nocache: boolean;
  _debug_context: string;
  _resolve_response: (response: IResponse<T>) => void;
  _reject_response: (error :string) => void;
  _response: Promise<IResponse<T>>;

  constructor(
    url: string,
    event_converter: EventConverter<T>,
    scheduler: request_scheduler.IRequestScheduler,
    priority: string,
    nocache: boolean,
    debug_context: string,
  ) {
    this._url = urls.normalizeUrl(url, urls.getSite());
    this._event_converter = event_converter;
    this._scheduler = scheduler;
    this._priority = priority;
    this._nocache = nocache;
    this._debug_context = debug_context;
    const response_promise_stuff = make_promise_with_callbacks<IResponse<T>>();
    this._response = response_promise_stuff.promise;
    this._resolve_response = response_promise_stuff.resolve;
    this._reject_response = response_promise_stuff.reject;
    this._state = State.NEW;
    setTimeout(() => this.A_Enqueue());
    console.log('AzadRequest NEW ' + this._url);
  }

  change_state(new_state: State): void {
    console.log(
      'AzadRequest', State[this._state], '->', State[new_state], this._url);
    this._state = new_state;
  }

  check_state(allowable_existing_state: State|State[]): void {
    if (Array.isArray(allowable_existing_state)) {
      const allowables = allowable_existing_state as State[];
      if (!allowables.includes(this._state)) {
        const msg = 'AzadRequest unexpected state: '
                  + State[this._state]
                  + ' but expecting one of ['
                  + allowables.map(a => State[a]).join(',')
                  + '] ' + this._url; 
        console.error(msg);
        throw msg;
      }; 
    } else {
      const allowable = allowable_existing_state as State;
      this.check_state([allowable]);
    }
  }

  response(): Promise<IResponse<T>> { return this._response; }

  A_Enqueue(): void {
    this.check_state(State.NEW);
    this.change_state(State.ENQUEUED);
    this._scheduler.schedule({
      task: ()=>{ return this.B_Dequeued(); },
      priority: this._priority
    });
  }

  async B_Dequeued(): Promise<void> {
    this.check_state(State.ENQUEUED);
    try {
      const cached = await this._scheduler
                               .cache()
                               .get(this._url) as (T | null | undefined);
    } catch (ex) {
      console.warn(ex);
    }
    this.change_state(State.DEQUEUED);
    return this.C_Send();
  }

  C_Send(): Promise<void> {
    const url_map = this._scheduler.overlay_url_map();
    if (Object.keys(url_map).length != 0) {
      return this.L_Overlaid();
    } else {
      return this.C_SendXHR();
    }
  }

  async C_SendXHR(): Promise<void> {
    this.check_state(State.DEQUEUED);
    this.change_state(State.SENT);
    const xhr = new XMLHttpRequest();
    console.log('opening xhr on ' + this._url);
    xhr.open('GET', this._url, true);
    return new Promise<void>((resolve, reject)=>{
      xhr.onerror = (): void => {
        if (!signin.checkTooManyRedirects(this._url, xhr) ) {
          console.log('Unknown error fetching ', this._debug_context, this._url);
        }
        const msg = 'got error from XMLHttpRequest';
        setTimeout(() => this.G_Failed(msg));
        reject(msg);
      };
      xhr.onload = (evt: any): void => {
        console.log('got response for ', this._debug_context, this._url); 
        if (!this._scheduler.isLive) {
          reject('scheduler no longer live');
        }
        try {
          if (
            xhr.responseURL.includes('/signin?') || xhr.status == 404
          ) {
            console.log(
              'Got sign-in redirect or 404 from: ',
              this._debug_context, this._url, xhr.status);
            const msg = 'got sign-in redirect or 404';
            setTimeout(() => this.G_Failed(msg));
            reject(msg);
            return;
          } else if ( xhr.status != 200 ) {
            const msg = 'Got HTTP' + xhr.status + ' fetching ' + this._url;
            console.warn(msg);
            setTimeout(() => this.G_Failed(msg));
            reject(msg);
            return;
          } else {
            const msg = 'Finished ' + this._debug_context + ' ' + this._url;
            console.info(msg);
            setTimeout( () => this.E_Response(evt) );
            resolve();
            return;
          }
        } catch (ex) {
          const msg = 'req handling caught unexpected: '
                    + this._debug_context + ex;
          console.error(msg);
          setTimeout( () => this.G_Failed(msg) );
          reject(msg);
          return;
        }
        reject('I don\'t know how I got here, but I shouldn\'t have');
      };
      xhr.timeout = 20000;  // 20 seconds
      xhr.ontimeout = (_evt: any): void => {
        if (this._scheduler.isLive()) {
          const msg = 'Timed out while fetching: '
                    + this._debug_context
                    + this._url;
          console.warn(msg);
          setTimeout( () => this.F_TimedOut() );
          reject(msg);
        }
      };
      xhr.send();
    });
  }

  async L_Overlaid(): Promise<void> {
    this.check_state(State.DEQUEUED);
    const url_map: request_scheduler.string_string_map
                   = this._scheduler.overlay_url_map();
    if (this._url in url_map) {
      const response_text = url_map[this._url];
      const fake_event: Event = {
        target: {
          responseURL: this._url,
          responseText: response_text,
        }
      } as Event;
      setTimeout(() => this.E_Response(fake_event));
      return Promise.resolve();
    } else {
      const msg = 'url not found in overlay map: ' + this._url;
      setTimeout(() => this.G_Failed(msg));
      return Promise.reject(msg);
    }
  }

  async D_CacheHit(converted: T) {
    this.check_state(State.DEQUEUED);
    this.change_state(State.CACHE_HIT);
    this._scheduler.stats().increment(stats.OStatsKey.CACHE_HIT_COUNT);
    setTimeout(() => this.IJK_Success(converted), 0);
  }

  E_Response(evt: Event) {
    this.check_state([State.SENT, State.DEQUEUED]);
    this.change_state(State.RESPONDED);
    this._scheduler.stats().increment(stats.OStatsKey.COMPLETED_COUNT);
    setTimeout(() => this.H_Convert(evt));
  }

  F_TimedOut() {
    this.check_state(State.SENT);
    this._scheduler.stats().increment(stats.OStatsKey.ERROR_COUNT);
    try {
      this._reject_response(this._url + ' timed out');
    } catch(ex) {
      console.error('rejection rejected for', this._url, 'after a timeout');
    }
    this.change_state(State.TIMED_OUT);
  }

  G_Failed(reason: string): void {
    this.check_state([State.SENT, State.DEQUEUED]);
    this._scheduler.stats().increment(stats.OStatsKey.ERROR_COUNT);
    try {
      this._reject_response(reason);
    } catch(ex) {
      console.error('rejection rejected for', this._url, 'with', reason);
    }
    this.change_state(State.FAILED);
  }

  H_Convert(evt: Event): void {
    this.check_state(State.RESPONDED);
    const protected_converter = (evt: any): T|null => {
      try {
        console.log(
          'protected_converter', this._debug_context, this._url,
          'priority', this._priority,
        );
        return this._event_converter(evt);
      } catch (ex) {
        console.error(
          'event conversion failed for ',
          this._debug_context,
          this._url,
          ex
        );
        return null;
      }
    };

    const converted = protected_converter(evt);
    if (converted == null) {
      this.change_state(State.FAILED);
      return;
    }

    this.change_state(State.CONVERTED);

    if (this._nocache) {
      this._scheduler.cache().set(this._url, converted);
      setTimeout(() => this.IJK_Success(converted));
    } else {
      setTimeout(() => this.J_Cached(converted));
    }
  }

  J_Cached(converted: T) {
    this.check_state(State.CONVERTED);
    this.change_state(State.CACHED);
    setTimeout(() => this.IJK_Success(converted), 0);
  }

  IJK_Success(converted: T) {
    this.check_state([State.CACHED, State.CACHE_HIT, State.CONVERTED]);
    const response: IResponse<T> = {
      query: this._url,
      result: converted,
    };
    try {
      this._resolve_response(response);
    } catch(ex) {
      console.warn(
        'While delivering response to ', this._url, ', caught: ', ex
      );
      try {
        this._reject_response(
          'resolve func threw, so rejecting instead for:' + this._url
        );
      } catch(rex) {
        console.error(
          'we are having a bad day - reject func threw after resolve, with:',
          rex
        );
      }
    }
    this._scheduler.stats().increment(stats.OStatsKey.COMPLETED_COUNT);
    this.change_state(State.SUCCESS);
  }
}

export async function makeAsyncRequest<T>(
    url: string,
    event_converter: EventConverter<T>,
    scheduler: request_scheduler.IRequestScheduler,
    priority: string,
    nocache: boolean,
    debug_context: string
): Promise<T> {
  const req = new AzadRequest(
    url,
    event_converter,
    scheduler,
    priority,
    nocache,
    debug_context,
  );
  const response = await req.response();
  return response.result;
}

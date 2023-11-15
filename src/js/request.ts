/* Copyright(c) 2023 Philip Mulcahy. */

import * as request_scheduler from './request_scheduler';
import * as signin from './signin';
import * as stats from './statistics';
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
   │─────┐
   │     │
   v C   v D
   │     │
  SENT  CACHE_HIT────────────────┐
   │                             │
   │─────>────┐──────>────┐      │
   │          │           │      │
   v E        │ F         │ G    │
   │          │           │      │
  RESPONDED (TIMED_OUT) (FAILED) │
   │                             │
   v H                           │
   │                             │ I
  CONVERTED                      │
   │                             │
   v J                           │
   │                             │
   │─────┐                       │
   │     │                       │
  CACHED │                       │
   │     │                       │
   v  K  │                       │
   │     │                       │
  (SUCCESS)<─────────────────────┘

*/

export enum State {
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

// Control
// TODO move back to request_scheduler
let live = true;
let signin_warned = false;

// Statistics
let completed_count: number = 0;
let error_count: number = 0;
let running_count: number = 0;
function update_statistics(): void {
  // TODO
}

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

export class AzadRequest<T> {
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
  }

  check_state(allowable_existing_state: State|State[]): void {
    if (Array.isArray(allowable_existing_state)) {
      (allowable_existing_state as [State]).forEach(
        state => this.check_state(state)
      ); 
    } else {
      if (allowable_existing_state != this._state) {
        throw (
          'Expected state: ' + allowable_existing_state.toString() +
          ' but actual state: ' + this._state.toString()
        );
      }
    }
  }

  response(): Promise<IResponse<T>> { return this._response; }

  A_Enqueued() {
    this.check_state(State.NEW);
    this._scheduler.schedule({
      task: ()=>{ return this.C_Send(); },
      priority: this._priority
    });
    this._state = State.ENQUEUED;
  }

  async B_Dequeued() {
    this.check_state(State.ENQUEUED);
    try {
      const cached = await this._scheduler
                               .cache()
                               .get(this._url) as (T | null | undefined);
    } catch (ex) {
      console.warn(ex);
    }
    this._state = State.DEQUEUED;
  }

  async C_Send(): Promise<void> {
    this.check_state(State.DEQUEUED);
    this._state = State.SENT;
    const xhr = new XMLHttpRequest();
    console.log('opening xhr on ' + this._url);
    xhr.open('GET', this._url, true);
    return new Promise<void>((resolve, reject)=>{
      xhr.onerror = (): void => {
        running_count -= 1;
        error_count += 1;
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
            error_count += 1;
            console.log(
              'Got sign-in redirect or 404 from: ',
              this._debug_context, this._url, xhr.status);
            if ( signin_warned ) {
              signin.alertPartiallyLoggedOutAndOpenLoginTab(this._url);
              signin_warned = true;
            }
            const msg = 'got sign-in redirect or 404';
            setTimeout(() => this.G_Failed(msg));
            reject(msg);
          } else if ( xhr.status != 200 ) {
            error_count += 1;
            const msg = 'Got HTTP' + xhr.status + ' fetching ' + this._url;
            console.warn(msg);
            setTimeout(() => this.G_Failed(msg));
            reject(msg);
          } else {
            completed_count += 1;
            const msg = 'Finished ' + this._debug_context + this._url;
            console.warn(msg);
            setTimeout( () => this.E_Response(evt) );
            reject(msg);
          }
        } catch (ex) {
          const msg = 'req handling caught unexpected: ' + this._debug_context + ex;
          console.error(msg);
          setTimeout( () => this.G_Failed(msg) );
          reject(msg);
        }
        resolve();
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

  async D_CacheHit(converted: T) {
    this.check_state(State.DEQUEUED);
    this._state = State.CACHE_HIT;
    setTimeout(() => this.IJK_Success(converted), 0);
  }

  E_Response(evt: Event) {
    this.check_state(State.SENT);
    this._state = State.RESPONDED;
  }

  F_TimedOut() {
    this.check_state(State.SENT);
    try {
      this._reject_response(this._url + ' timed out');
    } catch(ex) {
      console.error('rejection rejected for', this._url, 'after a timeout');
    }
    this._state = State.TIMED_OUT;
  }

  G_Failed(reason: string) {
    this.check_state(State.SENT);
    try {
      this._reject_response(reason);
    } catch(ex) {
      console.error('rejection rejected for', this._url, 'with', reason);
    }
    this._state = State.FAILED;
  }

  H_Convert(evt: Event) {
    this.check_state(State.RESPONDED);
    function protected_converter(evt: any): T|null {
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
    if (this._nocache) {
      this._scheduler.cache().set(this._url, converted);
      setTimeout(() => this.IJK_Success(converted));
    } else {
      setTimeout(() => this.J_Cached(converted));
    }
    this._state = State.CONVERTED;
  }

  J_Cached(converted: T) {
    this.check_state(State.CONVERTED);
    setTimeout(() => this.IJK_Success(converted), 0);
    this._state = State.CACHED;
  }

  IJK_Success(converted: T) {
    this.check_state([State.CACHED, State.CACHE_HIT]);
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
    this._state = State.SUCCESS;
  }
}

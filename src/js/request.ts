/* Copyright(c) 2023 Philip Mulcahy. */

import * as cachestuff from './cachestuff';
import * as request_scheduler from './request_scheduler';

'use strict';

/*

  NEW
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
   v C   v D
   │     │
  SENT  CACHE_HIT────────────────┐
   │                             │
   │─────>────┐──────>────┐      │
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
  CACHED                         │
   │                             │
   v  K                          │
   │                             │
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

export type EventConverter<T> = (evt: Event) => T;

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
  _priority: string;
  _cache: cachestuff.Cache;
  _nocache: boolean;
  _debug_context: string;
  _resolve_response: (response: IResponse<T>) => void;
  _reject_response: (error :string) => void;
  _response: Promise<IResponse<T>>;

  constructor(
    url: string,
    event_converter: EventConverter<T>,
    priority: string,
    cache: cachestuff.Cache,
    nocache: boolean,
    debug_context: string,
  ) {
    this._url = url;
    this._event_converter = event_converter;
    this._priority = priority;
    this._cache = cache;
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
    this._state = State.ENQUEUED;
  }


  async B_Dequeued() {
    this.check_state(State.ENQUEUED);
    try {
      const cached = await this._cache.get(this._url) as (T | null | undefined);
    } catch (ex) {
      console.warn(ex);
    }
    this._state = State.DEQUEUED;
  }

  C_Send() {
    this.check_state(State.DEQUEUED);
    this._state = State.SENT;
  }

  async D_CacheHit(converted: T) {
    this.check_state(State.DEQUEUED);
    this._state = State.CACHE_HIT;
    setTimeout(() => this.IK_Success(converted), 0);
  }

  E_Responded(evt: Event) {
    this.check_state(State.SENT);
    this._state = State.RESPONDED;
    const t = this._event_converter(evt)
  }

  H_Converted(converted: T) {
    this.check_state(State.RESPONDED);
    this._state = State.CONVERTED;
    setTimeout(() => this.J_Cached(converted), 0);
  }

  J_Cached(converted: T) {
    this.check_state(State.CONVERTED);
    this._cache.set(this._url, converted);
    this._state = State.CACHED;
    setTimeout(() => this.IK_Success(converted), 0);
  }

  IK_Success(converted: T) {
    this.check_state([State.CACHED, State.CACHE_HIT]);
    const response: IResponse<T> = {
      query: this._url,
      result: converted,
    };
    this._resolve_response(response);
    this._state = State.SUCCESS;
  }
}

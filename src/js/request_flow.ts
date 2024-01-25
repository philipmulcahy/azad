/* Copyright(c) 2024 Philip Mulcahy. */

'use strict';

import * as base from './request_base';
import * as request_scheduler from './request_scheduler';

interface IResponse<T> {
  result: T,
  query: string
}

export interface Request {
  url: string;
  state: base.State;
}

export interface RequestFlow {
  initial_state: base.State;
  outcome_states: base.State[];
  action: (req: Request) => base.State;
}

export type EventConverter<T> = (evt: Event) => T;

class AzadRequest<T> {
  _state: base.State = base.State.NEW;
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
    this._state = base.State.NEW;
    setTimeout(() => this.A_Enqueue());
    console.debug('AzadRequest NEW ' + this._url);
  }

  state(): base.State { return this._state; }
}

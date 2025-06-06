/* Copyright(c) 2023 Philip Mulcahy. */

import * as base from './request_base';
import * as iframeWorker from './iframe-worker';
import * as request_scheduler from './request_scheduler';
import * as stats from './statistics';
import * as signin from './signin';
import * as urls from './url';

'use strict';

interface IResponse<T> {
  result: T,
  query: string
}

interface IFetcher {
  execute(): Promise<Event>;
}

function makeXHRTask(
  url: string,
  scheduler: request_scheduler.IRequestScheduler, 
): IFetcher {
  return {
    execute: () => {
      const eventPromise = new Promise<Event>( (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        console.log('opening xhr on ' + url);
        xhr.open('GET', url, true);

        xhr.onerror = (): void => {
          if (!signin.checkTooManyRedirects(url, xhr) ) {
            console.log('Unknown error fetching ', url);
          }

          const msg = 'got error from XMLHttpRequest';
          reject(msg);
        };

        xhr.onload = (evt: ProgressEvent<EventTarget>): void => {
          console.debug('got response for', url);

          if (!scheduler.isLive) {
            reject('scheduler no longer live');
          }

          try {
            if (
              xhr.responseURL.includes('/signin?') || xhr.status == 404
            ) {
              const msg = `Got sign-in redirect or 404: ${url} ${xhr.status}`;
              console.warn(msg);

              if (!scheduler.get_signin_warned()) {
                signin.alertPartiallyLoggedOutAndOpenLoginTab(url);
                scheduler.set_signin_warned();
              }

              reject(msg);
              return;
            } else if ( xhr.status != 200 ) {
              const msg = 'Got HTTP' + xhr.status + ' fetching ' + url;
              console.warn(msg);
              reject(msg);
              return;
            } else {
              const msg = 'Finished ' + url;
              console.debug(msg);
              resolve(evt as any as Event);
              return;
            }
          } catch (ex) {
            const msg = 'req handling caught unexpected: ' + ex;
            console.error(msg);
            reject(msg);
            return;
          }
          reject('I don\'t know how I got here, but I shouldn\'t have');
        };

        xhr.timeout = 20000;  // 20 seconds

        xhr.ontimeout = (_evt: any): void => {
          if (scheduler.isLive()) {
            const msg = 'Timed out while fetching: ' + url;
            console.warn(msg);
            reject(msg);
          }
        };

        xhr.send();
      });

      return eventPromise;
    },
  }
}

function makeDynamicFetchTask(
  url: string,
  readyXPath: string,
  purpose: string,
): IFetcher {
  return {
    execute: async function(): Promise<Event>{
      const response = await iframeWorker.fetchURL(url, readyXPath, purpose);

      return {
        target: {
          responseText: response.html,
          responseURL: url,
        }
      };
    },
  }
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
  };
}

class AzadRequest<T> {
  _state: base.State = base.State.NEW;
  _url: string;
  _request_type: string;
  _fetcher: IFetcher;
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
    request_type: string,  // contributes to cache key
    fetcher: IFetcher,
    event_converter: EventConverter<T>,
    scheduler: request_scheduler.IRequestScheduler,
    priority: string,
    nocache: boolean,
    debug_context: string,
  ) {
    this._url = urls.normalizeUrl(url, urls.getSite());
    this._request_type = request_type;
    this._fetcher = fetcher;
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

  key(): string {
    return `${this._request_type}#${this._url}`; 
  }

  state(): base.State { return this._state; }

  change_state(new_state: base.State): void {
    console.debug(
      'AzadRequest', base.State[this._state],
      '->', base.State[new_state], this._url);

    this._state = new_state;
  }

  check_state(allowable_existing_state: base.State|base.State[]): void {
    if (Array.isArray(allowable_existing_state)) {
      const allowables = allowable_existing_state as base.State[];

      if (!allowables.includes(this._state)) {
        const msg = 'AzadRequest unexpected state: '
                  + base.State[this._state]
                  + ' but expecting one of ['
                  + allowables.map(a => base.State[a]).join(',')
                  + '] ' + this._url;

        console.error(msg);
        throw msg;
      }
    } else {
      const allowable = allowable_existing_state as base.State;
      this.check_state([allowable]);
    }
  }

  response(): Promise<IResponse<T>> { return this._response; }

  A_Enqueue(): void {
    this.check_state(base.State.NEW);
    this.change_state(base.State.ENQUEUED);

    this._scheduler.schedule(
      {
        task: ()=>{ return this.B_Dequeued(); },
          priority: this._priority
      },
      this
    )
  }

  async B_Dequeued(): Promise<void> {
    this.check_state(base.State.ENQUEUED);
    this.change_state(base.State.DEQUEUED);

    try {
      const cached = await this._scheduler
                               .cache()
                               .get(this.key()) as (T | null | undefined);

      if (cached != null) {
        return this.D_CacheHit(cached);
      }
    } catch (ex) {
      console.warn(ex);
    }

    return this.C_Send();
  }

  async C_Send(): Promise<void> {
    this.check_state(base.State.DEQUEUED);
    const url_map = this._scheduler.overlay_url_map();

    if (Object.keys(url_map).length != 0) {
      return this.L_Overlaid();
    } else {
      this.change_state(base.State.SENT);
      try {
        const evt = await this._fetcher.execute();
        setTimeout(() => this.E_Response(evt));
      } catch (ex) {
        if (typeof(ex) == 'string') {
          if (ex.toUpperCase().startsWith('TIMED OUT')) {
            setTimeout(() => this.F_TimedOut());
          } else {
            setTimeout(() => this.G_Failed(ex as string));
          }
        } else {
          setTimeout(() => this.G_Failed('unknown reason'));
        }
      }
    }
  }

  async L_Overlaid(): Promise<void> {
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
    this.check_state(base.State.DEQUEUED);
    this.change_state(base.State.CACHE_HIT);
    this._scheduler.stats().increment(stats.OStatsKey.CACHE_HIT_COUNT);
    setTimeout(() => this.IJK_Success(converted), 0);
  }

  E_Response(evt: Event) {
    this.check_state([base.State.SENT, base.State.DEQUEUED]);
    this.change_state(base.State.RESPONDED);
    this._scheduler.stats().increment(stats.OStatsKey.COMPLETED_COUNT);
    setTimeout(() => this.H_Convert(evt));
  }

  F_TimedOut() {
    this.check_state(base.State.SENT);
    this._scheduler.stats().increment(stats.OStatsKey.ERROR_COUNT);

    try {
      this._reject_response(this._url + ' timed out');
    } catch(ex) {
      console.error('rejection rejected for', this._url, 'after a timeout');
    }

    this.change_state(base.State.TIMED_OUT);
  }

  G_Failed(reason: string): void {
    this.check_state([
      base.State.SENT,
      base.State.DEQUEUED,
      base.State.RESPONDED,
    ]);

    this._scheduler.stats().increment(stats.OStatsKey.ERROR_COUNT);
    this.change_state(base.State.FAILED);

    try {
      this._reject_response(reason);
    } catch(ex) {
      console.error('rejection rejected for', this._url, 'with', reason);
    }
  }

  async H_Convert(evt: Event): Promise<void> {
    this.check_state(base.State.RESPONDED);

    const protected_converter = async (evt: any): Promise<T|null> => {
      try {
        console.debug(
          'protected_converter', this._debug_context, this._url,
          'priority', this._priority,
        );

        const t: T = await this._event_converter(evt);
        return t;
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

    const converted = await protected_converter(evt);

    if (converted == null) {
      setTimeout(() => this.G_Failed('conversion failed'));
      return;
    }

    this.change_state(base.State.CONVERTED);

    if (this._nocache) {
      setTimeout( () => this.IJK_Success(converted) );
    } else {
      setTimeout( () => this.J_Cached(converted) );
    }
  }

  async J_Cached(converted: T) {
    this.check_state(base.State.CONVERTED);
    await this._scheduler.cache().set(this.key(), converted);
    this.change_state(base.State.CACHED);
    setTimeout(() => this.IJK_Success(converted), 0);
  }

  IJK_Success(converted: T) {
    this.check_state(
      [base.State.CACHED, base.State.CACHE_HIT, base.State.CONVERTED]);

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
    this.change_state(base.State.SUCCESS);
  }
}

export async function makeAsyncStaticRequest<T>(
  url: string,
  request_type: string,
  event_converter: EventConverter<T>,
  scheduler: request_scheduler.IRequestScheduler,
  priority: string,
  nocache: boolean,
  debug_context: string,
): Promise<T> {
  const fetcher = makeXHRTask(url, scheduler);

  const req = new AzadRequest(
    url,
    request_type,
    fetcher,
    event_converter,
    scheduler,
    priority,
    nocache,
    debug_context,
  );

  const response = await req.response();
  return response.result;
}

export async function makeAsyncDynamicRequest<T>(
  url: string,
  request_type: string,
  event_converter: EventConverter<T>,
  readyXPath: string,
  scheduler: request_scheduler.IRequestScheduler,
  priority: string,
  nocache: boolean,
  debug_context: string,
): Promise<T> {
  console.log(`makeAsyncDynamicRequest(${url}, ${request_type}, ...) starting`);
  const fetcher = makeDynamicFetchTask(url, readyXPath, debug_context);
  
  try {
    const req = new AzadRequest(
      url,
      request_type,
      fetcher,
      event_converter,
      scheduler,
      priority,
      nocache,
      debug_context,
    );

    const response = await req.response();
    console.log(`makeAsyncDynamicRequest(${url}, ${request_type}, ...) complete`);
    return response.result;
  } catch(ex) {
    console.warn(`makeAsyncDynamicRequest(${url}, ${request_type}, ...) failed: ${ex}`);
    throw ex;
  }
}

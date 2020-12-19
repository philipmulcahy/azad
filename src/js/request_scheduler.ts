/* Copyright(c) 2016-2020 Philip Mulcahy. */

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

export interface IRequestScheduler {
    scheduleToPromise<T>(
        query: string,
        event_converter: (evt: any) => any,
        priority: string,
        nocache: boolean
    ): Promise<IResponse<T>>;

    abort(): void;
    clearCache(): void;
    isLive(): boolean;
}

class RequestScheduler {

    // chrome allows 6 requests per domain at the same time.
    CONCURRENCY: number = 6

    cache: cachestuff.Cache = cachestuff.createLocalCache('REQUESTSCHEDULER');
    queue: binary_heap.BinaryHeap = new binary_heap.BinaryHeap( (item: any): number => item.priority );
    running_count: number = 0;
    completed_count: number = 0
    error_count: number = 0;
    signin_warned: boolean = false;
    live = true;

    constructor() {
        console.log('constructing new RequestScheduler');
        this._update_statistics();
    }

    _schedule(
        query: string,
        event_converter: (evt: any) => any,
        success_callback: (results: any, query: string) => void,
        failure_callback: (query: string) => void,
        priority: string,
        nocache: boolean
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
        });
        this._executeSomeIfPossible();
    }

    scheduleToPromise<T>(
        query: string,
        event_converter: (evt: any) => any,
        priority: string,
        nocache: boolean
    ): Promise<IResponse<T>> {
        query = url.normalizeUrl(query);
        return new Promise<any>(
            (resolve, reject) => {
                try {
                    this._schedule(
                        query,
                        event_converter,
                        (result, query) => resolve(
                            {result: result, query: query}),
                        (query: string) => reject(query),
                        priority,
                        nocache
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
    _execute(
        query: string,
        event_converter: (evt: any) => any,
        success_callback: (converted_event: any, query: string) => void,
        failure_callback: (query: string) => void,
        priority: number,
        nocache: boolean
    ) {
        if (!this.live) {
            return;
        }
        console.log(
            'Executing ' + query +
            ' with queue size ' + this.queue.size() +
            ' and priority ' + priority
        );

        // Catch any exceptions that the client's callback throws
        // so as to avoid killing the "thread" and thus prevent
        // subsequent responses being handled.
        const protected_callback = (response: any, query: string) => {
            try {
                return success_callback(response, query);
            } catch (ex) {
                console.error('callback failed for ' + query + ' with ' + ex);
                return null;
            }
        }

        const protected_converter = (evt: any) => {
            try {
                return event_converter(evt);
            } catch (ex) {
                console.error(
                    'event conversion failed for ' + query + ' with ' + ex);
                return null;
            }
        }

        const cached_response = nocache ?
            undefined :
            this.cache.get(query);
        if (typeof(cached_response) !== 'undefined') {
            this._pretendToSendOne(query, protected_callback, cached_response);
        } else {
            this._sendOne(
                query,
                protected_converter,
                protected_callback,
                failure_callback,
                nocache
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
        this.running_count += 1;
        this._update_statistics();
        setTimeout(
            () => {
                success_callback(cached_response, query);
                this._recordSingleSuccess();
            }
        );
    }

    _recordSingleSuccess() {
        // Defer checking if we're done, because success_callback
        // (triggered above) probably involves a promise chain, and might
        // enqueue more work that might be abandonned if we shut this
        // scheduler down prematurely.
        setTimeout(
            () => {
                this.running_count -= 1;
                this.completed_count += 1;
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
        nocache: boolean
    ) {
        const req = new XMLHttpRequest();
        console.log('opening xhr on ' + url);
        req.open('GET', url, true);
        req.onerror = (): void =>  {
            this.running_count -= 1;
            this.error_count += 1;
            if (!signin.checkTooManyRedirects(url, req) ) {
                console.log( 'Unknown error fetching ' + url );
            }
            this._update_statistics();
            this._checkDone();
        };
        req.onload = (evt: any): void => {
            if (!this.live) {
                this.running_count -= 1;
                this._update_statistics();
                return;
            }
            if ( req.status != 200 ) {
                this.error_count += 1;
                console.warn(
                    'Got HTTP' + req.status + ' fetching ' + url);
                this.running_count -= 1;
                this._update_statistics();
                return;
            }
            if ( req.responseURL.includes('/signin?') ) {
                this.error_count += 1;
                this._update_statistics();
                console.log('Got sign-in redirect from: ' + url);
                if ( !this.signin_warned ) {
                    signin.alertPartiallyLoggedOutAndOpenLoginTab(url);
                    this.signin_warned = true;
                }
                this.running_count -= 1;
                this._update_statistics();
                return;
            }
            console.log(
              'Finished ' + url +
                ' with queue size ' + this.queue.size());
            const converted = event_converter(evt);
            if (!nocache) {
                this.cache.set(url, converted);
            }
            success_callback(converted, url);
            this._recordSingleSuccess();
        };
        req.timeout = 20000;  // 20 seconds
        req.ontimeout = (evt: any): void => {
            if (!this.live) {
                this.running_count -= 1;
                this._update_statistics();
                return;
            }
            console.log('Timed out while fetching: ' + url);
            this.error_count += 1;
            this.running_count -= 1;
            this._update_statistics();
            this._checkDone();
        }
        this.running_count += 1;
        this._update_statistics();
        req.send();
    }

    _executeSomeIfPossible() {
        while (this.running_count < this.CONCURRENCY &&
               this.queue.size() > 0
        ) {
            const task = this.queue.pop();
            this._execute(
                task.query,
                task.event_converter,
                task.success_callback,
                task.failure_callback,
                task.priority,
                task.nocache,
            );
        }
    }

    _checkDone() {
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

export function create(): IRequestScheduler {
    return new RequestScheduler();
};

/* Copyright(c) 2016-2020 Philip Mulcahy. */

'use strict';

import * as binary_heap from './binary_heap';
import * as cachestuff from './cachestuff';

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
    statistics(): Record<string, number>;
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
        return new Promise<any>(
            (resolve, reject) => {
                try {
                    this._schedule(
                        query,
                        event_converter,
                        (result, query) => resolve({result: result, query: query}),
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

    statistics() {
        return {
            'queued' : this.queue.size(),
            'running' : this.running_count,
            'completed' : this.completed_count,
            'errors' : this.error_count,
            'cache_hits' : this.cache.hitCount(),
        };
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
                console.error('event conversion failed for ' + query + ' with ' + ex);
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
                this._checkDone();
            }
        );
    }

    _sendOne(
        query: string,
        event_converter: (evt: any) => any,
        success_callback: (converted_event: any, query: string) => void,
        failure_callback: (query: string) => void,
        nocache: boolean
    ) {
        const req = new XMLHttpRequest();
        req.open('GET', query, true);
        req.onerror = function(): void {
            this.running_count -= 1;
            this.error_count += 1;
            console.log( 'Unknown error fetching ' + query );
            this._checkDone();
        }.bind(this);
        req.onload = function(evt: any) {
            if (!this.live) {
                this.running_count -= 1;
                return;
            }
            if ( req.status != 200 ) {
                this.error_count += 1;
                console.log(
                    'Got HTTP' + req.status + ' fetching ' + query);
                this.running_count -= 1;
                return;
            }
            if ( req.responseURL.includes('/ap/signin?') ) {
                this.error_count += 1;
                console.log('Got sign-in redirect from: ' + query);
                if ( !this.signin_warned ) {
                    alert('Amazon Order History Reporter Chrome Extension\n\n' +
                          'It looks like you might have been logged out of Amazon.\n' +
                          'Sometimes this can be "partial" - some types of order info stay logged in and some do not.\n' +
                          'I will now attempt to open a new tab with a login prompt. Please use it to login,\n' +
                          'and then retry your chosen orange button.');
                    this.signin_warned = true;
                    chrome.runtime.sendMessage(
                        {
                            action: 'open_tab',
                            url: query
                        }
                    );
                }
                this.running_count -= 1;
                return;
            }
            console.log(
              'Finished ' + query +
                ' with queue size ' + this.queue.size());
            const converted = event_converter(evt);
            if (!nocache) {
                this.cache.set(query, converted);
            }
            success_callback(converted, query);
            this._recordSingleSuccess();
        }.bind(this);
        req.timeout = 20000;  // 20 seconds
        req.ontimeout = function(evt: any) {
            if (!this.live) {
                this.running_count -= 1;
                return;
            }
            console.log('Timed out while fetching: ' + query);
            this.error_count += 1;
            this.running_count -= 1;
            this._checkDone();
        }.bind(this);
        this.running_count += 1;
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

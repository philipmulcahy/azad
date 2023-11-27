/* Copyright(c) 2016-2023 Philip Mulcahy. */

'use strict';

import * as binary_heap from './binary_heap';
import * as cachestuff from './cachestuff';
import * as signin from './signin';
import * as stats from './statistics';

export type string_string_map = {[key: string]: string};

const cache = cachestuff.createLocalCache('REQUESTSCHEDULER');

export type Task = ()=>Promise<void>;
export type PrioritisedTask = {task: Task, priority: string};

export class Statistics {
  _stats: {[key: string]: number} = {};

  constructor() {
    this._stats['running_count'] = 0;
    this._stats['queued'] = 0;
    this._stats['cache_hits'] = 0;
  }

  increment(key: string): void {
    const count: number = Object.keys(this._stats).includes(key)
                        ? this._stats[key]
                        : 0;
    this._stats[count+1];
  }
  decrement(key: string): void {
    const count: number = Object.keys(this._stats).includes(key)
                        ? this._stats[key]
                        : 0;
    this._stats[count-1];
  }
  set(key: string, value: number) {this._stats[key] = value;}
  clear(): void { this._stats = {}; }
  send(): void {
    ['queued', 'running', 'completed', 'errors', 'cache_hits'].forEach(key => {
      stats.set(key, this._stats[key]);
    });
  }
}

export interface IRequestScheduler {
  schedule(task: PrioritisedTask): void;
  abort(): void;
  cache(): cachestuff.Cache;
  isLive(): boolean;
  purpose(): string;
  stats(): Statistics;
  overlay_url_map(): string_string_map;
}

class RequestScheduler {

  // chrome allows 6 requests per domain at the same time.
  CONCURRENCY: number = 6;

  _stats: Statistics = new Statistics();
  _overlay_url_map: string_string_map = {};

  stats(): Statistics {return this._stats;}
  running_count(): number { return this._stats._stats['running_count']; }
  completed_count(): number { return this._stats._stats['completed_count']; }
  queue_size(): number { return this.queue.size(); }

  queue: binary_heap.BinaryHeap = new binary_heap.BinaryHeap(
    (item: any): number => item.priority
  );
  signin_warned: boolean = false;
  live: boolean = true;
  _purpose: string;

  constructor(purpose: string, overlay_url_map: string_string_map) {
    this._purpose = purpose;
    this._overlay_url_map = overlay_url_map;
    console.log('constructing new RequestScheduler');
    this._stats.send();
  }

  purpose(): string { return this._purpose; }
  overlay_url_map(): string_string_map { return this._overlay_url_map; }

  schedule(task: PrioritisedTask) {
    console.log(
      'Scheduling task with queue size ', this.queue.size(),
      ' and priority ', task.priority
    );
    this.queue.push(task);
    this._stats.set('queued', this.queue_size());
    this._executeSomeIfPossible();
  }

  abort() {
    // Prevent (irreversably) this scheduler from doing any more work.
    console.log('RequestScheduler.abort()');
    this.live = false;
  }

  cache() {
    return cache;
  }

  isLive() {
    return this.live;
  }

  // Process a single de-queued request either by retrieving from the cache
  // or by sending it out.
  async _execute(task: ()=>Promise<void>) {
    if (!this.live) {
      return;
    }
    console.log(
      'Executing task with queue size', this.queue.size()
    );

    try {
      this._stats.increment('running_count');
      await task();
    } catch( ex ) {
      if (typeof(ex) == 'string' && (ex as string).includes('sign-in')) {
        if ( !this.signin_warned ) {
          signin.alertPartiallyLoggedOutAndOpenLoginTab(ex as string);
          this.signin_warned = true;
        }
      }
      const msg = 'task threw: ' + (ex as string).toString();
      return Promise.reject(msg);
    }
    this.recordSingleSuccess();
    return Promise.resolve();
  }

  recordSingleSuccess() {
    this.recordSingleCompletion();
  }

  recordSingleFailure(msg: string) {
    console.warn(msg);
    this.recordSingleCompletion();
  }

  recordSingleCompletion() {
    this._stats.decrement('running_count');
    setTimeout(
      () => {
        this._executeSomeIfPossible();
        this._stats.send();
        this._checkDone();
      }
    );
  }

  async _executeSomeIfPossible() {
    console.debug(
      '_executeSomeIfPossible: size: ' + this.queue.size() +
      ', running: ' + this.running_count()
    );
    while (this.running_count() < this.CONCURRENCY &&
      this.queue.size() > 0
    ) {
      const task = (this.queue.pop() as PrioritisedTask).task;
      this._stats.set('queued', this.queue_size());
      this._stats.increment('running_count');
      try {
        await this._execute(task);
      } catch (ex) {
        console.warn('task execution blew up: ', ex);
      }
    }
  }

  _checkDone() {
    console.debug(
      '_checkDone: size: ' + this.queue.size() +
      ', running: ' + this.running_count() +
      ', completed: ' + this.completed_count()
    );
    if (
      this.queue.size() == 0 &&
      this.running_count() == 0 &&
      this.completed_count() > 0  // make sure we don't kill a brand-new scheduler
    ) {
      console.log('RequestScheduler._checkDone() succeeded');
      this.live = false;
    }
  }
}

export function create(purpose: string): IRequestScheduler {
  return new RequestScheduler(purpose, {});
}

export function create_overlaid(
  purpose: string,
  url_map: string_string_map
): IRequestScheduler {
  return new RequestScheduler(purpose, url_map);
}

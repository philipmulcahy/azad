/* Copyright(c) 2016-2023 Philip Mulcahy. */

'use strict';

import * as base from './request_base';
import * as binary_heap from './binary_heap';
import * as cachestuff from './cachestuff';
import * as request_base from './request_base';
import * as stats from './statistics';

export type string_string_map = {[key: string]: string};

const cache = cachestuff.createLocalCache('REQUESTSCHEDULER');

export type Task = ()=>Promise<void>;
export type PrioritisedTask = {task: Task, priority: string};
export type IdentifiedTask = {task: PrioritisedTask, id: number};

export interface IRequestScheduler {
  // Ask the scheduler to do some work, but not before it's done higher
  // priority tasks that are submitted before execution starts.
  schedule(task: PrioritisedTask, stateful: request_base.UntypedRequest): void;

  // Prevent the scheduler from doing any more work, or accepting any more.
  abort(): void;

  get_signin_warned(): boolean;
  set_signin_warned(): void;

  cache(): cachestuff.Cache;
  isLive(): boolean;
  purpose(): string;
  stats(): stats.Statistics;
  overlay_url_map(): string_string_map;
}

class RequestTracker {
  _requests: base.UntypedRequest[] = [];

  register(request: base.UntypedRequest): void {
    this._requests.push(request);
  }

  stateCounts(): Map<base.State, number> {
    const counts = new Map<base.State, number>();
    this._requests.forEach( r => {
      const state: base.State = r.state();
      const previous: number = counts.has(state) ? counts.get(state) as number : 0;
      counts.set(state, previous + 1);
    });
    return counts;
  }

  allDone(): boolean {
    const counts = this.stateCounts();
    for(const k of counts.keys()) {
      if (counts.get(k) == 0) {
        counts.delete(k);
      }
    }
    const entries = Array.from(counts.entries());
    const states_msg = 'StateCounts: ' +
      entries.map(e => base.State[e[0]] + ':' + e[1]).join(', ');
    const incomplete = entries.filter(e => ![
                                             base.State.SUCCESS,
                                             base.State.TIMED_OUT,
                                             base.State.FAILED,
                                           ].includes(e[0]))
                              .filter(e => e[1] != 0);
    const result = incomplete.length == 0;
    console.debug('RequestTracker.allDone() returning', result, states_msg);
    return result;
  }
}

class RequestScheduler {

  // chrome allows 6 requests per domain at the same time.
  CONCURRENCY: number = 6;

  _sequence_number: number = 0;

  _stats: stats.Statistics;
  _overlay_url_map: string_string_map = {};
  _purpose: string;

  _queue: binary_heap.BinaryHeap = new binary_heap.BinaryHeap(
    (item: any): number => item.priority
  );

  _tracker: RequestTracker = new RequestTracker();

  stats(): stats.Statistics { return this._stats; }

  stateCounts() { return this._tracker.stateCounts(); }

  running_count(): number {
    return this.stats().get(stats.OStatsKey.RUNNING_COUNT);
  }

  completed_count(): number {
    return this.stats().get(stats.OStatsKey.COMPLETED_COUNT);
  }

  queue_size(): number { return this._queue.size(); }

  _signin_warned: boolean = false;
  get_signin_warned(): boolean { return this._signin_warned; }
  set_signin_warned(): void { this._signin_warned = true; }

  live: boolean = true;

  constructor(
    purpose: string,
    overlay_url_map: string_string_map,
    get_background_port: () => Promise<chrome.runtime.Port|null>,
    statistics: stats.Statistics,
  ) {
    this._purpose = purpose;
    this._overlay_url_map = overlay_url_map;
    this._get_background_port = get_background_port;
    this._stats = statistics;
    console.log('constructing new RequestScheduler');
    this.stats().publish(get_background_port, 'starting scrape');
  }

  purpose(): string { return this._purpose; }
  overlay_url_map(): string_string_map { return this._overlay_url_map; }

  schedule(task: PrioritisedTask, stateful: request_base.UntypedRequest) {
    const id = this._sequence_number;
    this._sequence_number += 1;
    const id_task: IdentifiedTask = {task: task, id: id};
    this._tracker.register(stateful);
    this._queue.push(id_task);
    this.stats().set(stats.OStatsKey.QUEUED_COUNT, this.queue_size());
    console.debug(
      'Scheduled task', id, 'with new queue size ', this.queue_size(),
      'running count', this.running_count(),
      'scheduler liveness', this.isLive(),
      'and priority', task.priority
    );
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

  _get_background_port: ()=> Promise<chrome.runtime.Port|null>;

  // Process a single de-queued request either by retrieving from the cache
  // or by sending it out.
  async _execute(task: IdentifiedTask): Promise<void> {
    if (!this.live) {
      return;
    }
    console.debug(
      'Starting task', task.id, 'with queue size', this.queue_size()
    );

    try {
      this._stats.increment(stats.OStatsKey.RUNNING_COUNT);
      await task.task.task();
      console.debug(
        'Finished task', task.id, 'with queue size', this.queue_size()
      );
    } catch( ex ) {
      const msg = 'task ' + task.id + ' threw: ' + (ex as string).toString();
      return Promise.reject(msg);
    } finally {
      this._stats.decrement(stats.OStatsKey.RUNNING_COUNT);
    }
    this._recordSingleSuccess();
    return Promise.resolve();
  }

  _recordSingleSuccess(): void {
    this._recordSingleCompletion();
  }

  _recordSingleFailure(msg: string): void {
    console.warn(msg);
    this._recordSingleCompletion();
  }

  _recordSingleCompletion(): void {
    setTimeout(
      async () => {
        this._executeSomeIfPossible();
        const port = await this._get_background_port();
        this._stats.publish(this._get_background_port, this._purpose);
        this._checkDone();
      }
    );
  }

  _canExecuteOne(): boolean {
    const running = this.running_count();
    const queue = this.queue_size();
    return running < this.CONCURRENCY && queue > 0;
  }

  _executeSomeIfPossible(): void {
    console.debug(
      '_executeSomeIfPossible: size: ' + this.queue_size() +
      ', running: ' + this.running_count()
    );
    while (this._canExecuteOne()) {
      const task = this._queue.pop() as IdentifiedTask;
      const task_id = task.id;
      this.stats().set(stats.OStatsKey.QUEUED_COUNT, this.queue_size());
      try {
        this._execute(task).then(
          () => { console.debug('completed task'); },
          (err) => { console.warn('task rejected with', err); },
        );
      } catch (ex) {
        console.warn('task', task_id, 'blew up synchronously: ', ex);
      }
    }
  }

  _checkDone(): void {
    console.debug(
      '_checkDone: size: ' + this.queue_size() +
      ', running: ' + this.running_count() +
      ', completed: ' + this.completed_count()
    );
    if (
      this.queue_size() == 0 &&
      this.running_count() == 0 &&
      this.completed_count() > 0 && // make sure we don't kill a brand-new scheduler
      this._tracker.allDone() // expensive
    ) {
      console.log('RequestScheduler._checkDone() succeeded');
      this.live = false;
    }
  }
}

export function create(
  purpose: string,
  background_port_getter: () => Promise<chrome.runtime.Port | null>,
  statistics: stats.Statistics,
): IRequestScheduler {
  return new RequestScheduler(
    purpose, {}, background_port_getter, statistics);
}

export function create_overlaid(
  purpose: string,
  url_map: string_string_map,
  background_port_getter: () => Promise<chrome.runtime.Port | null>,
  statistics: stats.Statistics,
): IRequestScheduler {
  return new RequestScheduler(
    purpose, url_map, background_port_getter, statistics);
}

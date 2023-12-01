/* Copyright(c) 2020 Philip Mulcahy. */

export enum StatsKey {
  QUEUED_COUNT = 1,
  RUNNING_COUNT,
  COMPLETED_COUNT,
  CACHE_HIT_COUNT,
  ERROR_COUNT,
}

type Stats = Record<StatsKey, number>;

export class Statistics {
  _stats: Stats = {
    [StatsKey.QUEUED_COUNT]: 0,
    [StatsKey.RUNNING_COUNT]: 0,
    [StatsKey.COMPLETED_COUNT]: 0,
    [StatsKey.CACHE_HIT_COUNT]: 0,
    [StatsKey.ERROR_COUNT]: 0,
  };

  increment(key: StatsKey): void {
    const count: number = this._stats[key];
    this._stats[key] = count + 1;
  }
  decrement(key: StatsKey): void {
    const count: number = this._stats[key];
    this._stats[key] = count - 1;
  }
  get(key: StatsKey) {return this._stats[key];}
  set(key: StatsKey, value: number) {this._stats[key] = value;}
  clear(): void { this._stats = new Statistics()._stats }
  publish(port: chrome.runtime.Port | null, purpose: string) {
    if (!port ) {
      return;  
    }
    try {
      port.postMessage({
          action: 'statistics_update',
          statistics: this._stats,
          purpose: purpose,
      });
    } catch(ex) {
      console.debug('statistics.publish threw ', ex);
    }
  }
}

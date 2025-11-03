/* Copyright(c) 2020-2025 Philip Mulcahy. */

import * as gitHash from './git_hash'; 
import * as urls from './url'; 

export const OStatsKey = {
  QUEUED_COUNT: 0,
  RUNNING_COUNT: 1,
  COMPLETED_COUNT: 2,
  CACHE_HIT_COUNT: 3,
  ERROR_COUNT: 4,
};

export type StatsKey = typeof OStatsKey[keyof typeof OStatsKey];

type Stats = Record<StatsKey, number>;
type StringNumberMap = {[key: string]: number};

export class Statistics {
  _stats: Stats = {
    [OStatsKey.QUEUED_COUNT]: 0,
    [OStatsKey.RUNNING_COUNT]: 0,
    [OStatsKey.COMPLETED_COUNT]: 0,
    [OStatsKey.CACHE_HIT_COUNT]: 0,
    [OStatsKey.ERROR_COUNT]: 0,
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
  clear(): void { this._stats = new Statistics()._stats; }

  transmittable(): StringNumberMap {
    const t: StringNumberMap = {};
    Object.keys(OStatsKey)
          .forEach((ks: string) => {
      const k: StatsKey = OStatsKey[ks as keyof typeof OStatsKey];
      const num: number = this._stats[k];
      t[ks] = num;
    });
    return t;
  }

  async publish(
    getPort: () => Promise<chrome.runtime.Port | null>,
    purpose: string
  ) {
    try {
      const s = this.transmittable();
      const port = await getPort();

      if (!port ) {
        return;
      }

      port.postMessage({
          action: 'statistics_update',
          statistics: s,
          purpose: purpose,
      });
    } catch(ex) {
      console.debug('statistics.publish threw ', ex);
    }
  }
}

class Key {
  readonly _labels: Map<string, string>;

  constructor(labels: Map<string, string>) {
    this._labels = new Map<string, string>(labels);
  }

  toString(): string {
    return this.keys.map(k => `${k}=${this._labels.get(k)}`).join(',');
  }

  get keys(): string[] {
    const keys = [...this._labels.keys()];
    keys.sort();
    return keys;
  }
}

export class StrategyStats {
  static readonly _stats = new Map<string, number>();
  static readonly _gitHash = gitHash.hash() + gitHash.isClean() ? '' : '*';
  static readonly _site = urls.getSite();

  static _callSiteToKey(callSiteName: string): Key {
    const labels = new Map<string, string>();
    labels.set('git_hash', StrategyStats._gitHash);
    labels.set('site', StrategyStats._site);
    labels.set('call_site_name', callSiteName);
    return new Key(labels);
  }

  static reportSuccess(callSiteName: string, strategyIndex: number) {
    const keyString = StrategyStats._callSiteToKey(callSiteName).toString();

    console.debug(
      `StrategyStats.reportSuccess ${keyString}, ${strategyIndex}`
    );
  }

  static reportFailure(callSiteName: string) {
    const keyString = StrategyStats._callSiteToKey(callSiteName).toString();

    console.debug(
      `StrategyStats.reportSuccess ${keyString}`
    );
  }
}

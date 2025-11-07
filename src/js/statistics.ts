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

  setLabel(labelName: string, labelValue: string): Key {
    const augmented = new Map<string, string>(this._labels);
    augmented.set(labelName, labelValue);
    return new Key(augmented);
  }

  toString(): string {
    return this.keys.map(k => `${k}:${this._labels.get(k)}`).join(',');
  }

  get keys(): string[] {
    const keys = [...this._labels.keys()];
    keys.sort();
    return keys;
  }
}

export class StrategyStats {
  static readonly _localStats: StrategyStats = new StrategyStats();

  readonly _stats = new Map<string, number>();

  static readonly _gitHash: string = gitHash.hash()
    + (gitHash.isClean() ? '' : '*');

  static readonly _site: string = urls.getSite();


  static _callSiteToKey(callSiteName: string): Key {
    const labels = new Map<string, string>();
    labels.set('git_hash', StrategyStats._gitHash);
    labels.set('site', StrategyStats._site);
    labels.set('call_site_name', callSiteName);
    return new Key(labels);
  }

  increment(key: Key): void {
    const ks = key.toString();
    const iOld: number = this._stats.get(ks) ?? 0;
    const iNew = iOld + 1;
    this._stats.set(ks, iNew);
  }

  serialize(): string {
    const o = {};
    for (const e of this._stats.entries()) {
      const ks: string = e[0].toString();
      const v: number = e[1];
      Object.defineProperty(o, ks, {value: v, enumerable: true});
    }
    return JSON.stringify(o);
  }

  static deserialize(json: string): StrategyStats {
    const o = JSON.parse(json);
    const stats = new StrategyStats();
    for (const e of Object.entries(o)) {
      const ks: string = e[0].toString();
      const v: number = e[1] as number;
      stats._stats.set(ks, v);
    }
    return stats;
  }

  add(stats: StrategyStats): StrategyStats {
    const sum = new StrategyStats();

    for(const e of this._stats.entries()) {
      const ks: string = e[0].toString();
      const v: number = e[1];
      sum._stats.set(ks, v);
    }

    for(const e of stats._stats.entries()) {
      const ks: string = e[0].toString();
      const v = (sum._stats.get(ks) ?? 0) + e[1];
      sum._stats.set(ks, v);
    }

    return sum
  }

  static readonly storageKey = 'Azad_StrategyStats_global';

  static async load(): Promise<StrategyStats> {
    const results = await chrome.storage.local.get(StrategyStats.storageKey);

    if (results.hasOwnProperty(StrategyStats.storageKey)) {
      const json = results[StrategyStats.storageKey] as string;
      return StrategyStats.deserialize(json);
    }

    return new StrategyStats();
  }

  async save(): Promise<void> {
    const json = this.serialize()
    return chrome.storage.local.set({[StrategyStats.storageKey]: json});
  }

  static toString(): string {
    return StrategyStats._localStats.toString();
  }

  toString(): string {
    return [...this._stats.entries()]
      .map(e => {
        const k = e[0];
        const v = e[1];
        return `${k}=${v};`;
      })
      .join('\n');
  }

  static async logAndSave(): Promise<void> {
    console.log('STRATEGYSTATS_LOCAL...');
    console.log(StrategyStats._localStats.toString());

    const previous = await StrategyStats.load();
    const updated = previous.add(StrategyStats._localStats);
    updated.save();

    console.log('STRATEGYSTATS_ALL...');
    console.log(updated.toString());
  }

  static reportSuccess(callSiteName: string, strategyIndex: number) {
    const key= StrategyStats
      ._callSiteToKey(callSiteName)
      .setLabel('strategy_index', strategyIndex.toString());

    StrategyStats._localStats.increment(key);
  }

  static reportFailure(callSiteName: string) {
    StrategyStats.reportSuccess(callSiteName, -1);
  }
}

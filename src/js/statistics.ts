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

export class Counters {
  static readonly _localStats: Counters = new Counters();
  static readonly _site: string = urls.getSite();
  static readonly storageKey = 'Azad_StrategyStats_global';

  static readonly _gitHash: string = gitHash.hash().substr(0, 8)
    + (gitHash.isClean() ? '' : '*');

  readonly _stats = new Map<string, number>();

  static get stats(): Counters {
    return Counters._localStats;
  }

  increment(counterGroup: string, key: Key): void {
    this.incrementBy(counterGroup, key, 1);
  }

  incrementBy(counterGroup: string, key: Key, count: number): void {
    const completeKey = key.setLabel('group', counterGroup)
                           .setLabel('git_hash', Counters._gitHash)
                           .setLabel('site', Counters._site);

    const ks = completeKey.toString();
    const iOld: number = this._stats.get(ks) ?? 0;
    const iNew = iOld + count;
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

  static deserialize(json: string): Counters {
    const o = JSON.parse(json);
    const stats = new Counters();
    for (const e of Object.entries(o)) {
      const ks: string = e[0].toString();
      const v: number = e[1] as number;
      stats._stats.set(ks, v);
    }
    return stats;
  }

  add(stats: Counters): Counters {
    const sum = new Counters();

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

  static async load(): Promise<Counters> {
    const results = await chrome.storage.local.get(Counters.storageKey);

    if (results.hasOwnProperty(Counters.storageKey)) {
      const json = results[Counters.storageKey] as string;
      return Counters.deserialize(json);
    }

    return new Counters();
  }

  async save(): Promise<void> {
    const json = this.serialize()
    return chrome.storage.local.set({[Counters.storageKey]: json});
  }

  static toString(): string {
    return Counters._localStats.toString();
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
    console.log(Counters._localStats.toString());

    const previous = await Counters.load();
    const updated = previous.add(Counters._localStats);
    updated.save();

    console.log('STRATEGYSTATS_ALL...');
    console.log(updated.toString());
  }
}

// (almost) stateless proxy for a partition of Counters
class CounterGroup {
  readonly groupName: string;

  constructor(groupName: string) {
    this.groupName = groupName;
  }

  increment(key: Key) {
    Counters.stats.increment(this.groupName, key);
  }

  incrementBy(key: Key, count: number) {
    Counters.stats.incrementBy(this.groupName, key, count);
  }
}

export class StrategyStats {
  static readonly group = new CounterGroup('strategy');

  static reportSuccess(callSiteName: string, strategyIndex: number) {
    const labels = new Map<string, string>();
    labels.set('call_site_name', callSiteName);
    labels.set('strategy_index', strategyIndex.toString());
    const key = new Key(labels);
    this.group.increment(key);
  }

  static reportFailure(callSiteName: string) {
    this.reportSuccess(callSiteName, -1);
  }
}

export class UrlStats {
  static readonly group = new CounterGroup('url');

  static reportSuccess(urlPattern: string, successfulFetchCount: number) {
    const labels = new Map<string, string>();
    labels.set('url_pattern', urlPattern);
    const key = new Key(labels);
    this.group.incrementBy(key, successfulFetchCount);
  }

  static reportFailure(urlPattern: string) {
    const labels = new Map<string, string>();
    labels.set('url_pattern', urlPattern);
    const key = new Key(labels);
    this.group.increment(key);
  }
}

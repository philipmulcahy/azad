/* Copyright(c) 2020 Philip Mulcahy. */

const stats: Record<string, number> = {};

export function set(name: string, value: number): void {
    stats[name] = value;
}

export function get(name: string): number {
    return stats[name];
}

export function publish(port: chrome.runtime.Port, purpose: string) {
    port.postMessage({
        action: 'statistics_update',
        statistics: stats,
        purpose: purpose,
    });
}

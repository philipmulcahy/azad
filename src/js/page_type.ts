/* Copyright(c) 2025 Philip Mulcahy. */

const WORKER_TYPE = 'azad-iframe-worker';
const NAME_SEPARATOR = ':';

export interface WorkerNameParts {
  type: string;
  guid: string;
}

export function makeWorkerName(guid: string): string {
  return `${WORKER_TYPE}${NAME_SEPARATOR}${guid}`;
}

export function parseWorkerName(name: string): WorkerNameParts | null {
  const separatorIndex = name.indexOf(NAME_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }

  const type = name.slice(0, separatorIndex);
  const guid = name.slice(separatorIndex + 1);

  if (type !== WORKER_TYPE || guid.length === 0) {
    return null;
  }

  return { type, guid };
}

export function getWorkerGuid(): string | null {
  const parsed = parseWorkerName(window.name);
  return parsed ? parsed.guid : null;
}

export function isIframe(): boolean {
  const wellIsIt = window.self !== window.top;
  return wellIsIt;
}

export function isWorker(): boolean {
  return isIframe() && parseWorkerName(window.name) !== null;
}

export function getPageType(): string {
  const iw = isWorker();

  return iw ?
    'azad_iframe_worker' :
    'azad_inject';
}


/* Status for an active Amazon scrape. Do not infer completion from worker frames. */

type Phase = 'working' | 'finishing' | 'complete' | 'error';
let phase: Phase = 'working';
let message = 'Reading Amazon history';
let counts = '';
let active = false;

export function ensure(): void {
  if (!active) return;
  let panel = document.getElementById('azad_scrape_status');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'azad_scrape_status';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    document.body.insertBefore(panel, document.body.firstChild);
  }
  panel.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = phase === 'working' ? 'AZAD is working' :
    phase === 'finishing' ? 'Preparing results' :
    phase === 'complete' ? 'AZAD export ready' : 'AZAD encountered a problem';
  panel.appendChild(title);
  const detail = document.createElement('div');
  detail.textContent = message;
  panel.appendChild(detail);
  if (counts) {
    const countNode = document.createElement('small');
    countNode.textContent = counts;
    panel.appendChild(countNode);
  }
  panel.className = 'azad_status_' + phase;
}

export function start(): void {
  active = true;
  phase = 'working';
  message = 'Keep this Amazon tab open. Worker previews may appear and disappear.';
  counts = '';
  ensure();
}

export function update(queued: number, running: number, completed: number, errors: number): void {
  if (!active || phase !== 'working') return;
  counts = 'Running: ' + running + ' | Queued: ' + queued +
    ' | Completed requests: ' + completed + ' | Errors: ' + errors;
  ensure();
}

export function finishing(): void {
  if (!active) return;
  phase = 'finishing';
  message = 'Checking the extracted data and preparing the table.';
  ensure();
}

export function complete(): void {
  if (!active) return;
  phase = 'complete';
  message = 'The results table and CSV download are ready.';
  counts = '';
  ensure();
}

export function failed(): void {
  if (!active) return;
  phase = 'error';
  message = 'The results could not be prepared. Try refreshing Amazon and running again.';
  ensure();
}

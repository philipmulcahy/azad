/* Copyright(c) 2026 Philip Mulcahy. */

/* eslint-disable @typescript-eslint/no-var-requires */

// Runs the time-zone-sensitive jest tests once per time zone.
//
// Why a separate jest process per zone? Jest gives each test file its own
// copy of process.env, so setting TZ inside a test never reaches Node's Date.
// Order dates west of Greenwich are where things have gone wrong before
// (orders placed on 1 January landing in the previous year), so most of the
// zones below are in the Americas.

const subProcess = require('child_process');

const ZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const TESTS = [
  'src/tests/jest/order_date_timezone.test.ts',
];

const jestBin = require.resolve('jest/bin/jest');
const failedZones = [];

for (const tz of ZONES) {
  console.log(`\n=== TZ=${tz} ===`);

  const result = subProcess.spawnSync(
    process.execPath,
    [jestBin, ...TESTS],
    {
      stdio: 'inherit',
      env: {...process.env, TZ: tz},
    },
  );

  if (result.status !== 0) {
    failedZones.push(tz);
  }
}

if (failedZones.length) {
  console.error(`\nFailed in: ${failedZones.join(', ')}`);
  process.exit(1);
}

console.log(`\nPassed in all ${ZONES.length} time zones.`);

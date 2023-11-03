/* Copyright(c) 2023 Philip Mulcahy. */

'use strict';

/*
NEW
 │
 │
ENQUEUED
 │
 │
DEQUEUED
 │
 │─────┐
 │     │
SENT  CACHE_HIT────────────────┐
 │                             │
 │──────────┐───────────┐      │
 │          │           │      │
RESPONDED (TIMED_OUT) (FAILED) │
 │                             │
 │                             │
CONVERTED                      │
 │                             │
 │                             │
CACHED                         │
 │                             │
 │                             │
(SUCCESS)──────────────────────┘

*/

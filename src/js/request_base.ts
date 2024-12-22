/* Copyright(c) 2023 Philip Mulcahy. */

/*

     [NEW]
       │
       v A
       │
    ENQUEUED
       │
       v B
       │
    DEQUEUED
       │
 ╭─────┼──────╮
 │     │      │
 │     v C    v D
 │     │      │
 │    SENT  CACHE_HIT───────>────────╮
 v L   │                             │
 │     ├─────>────┬──────>─────╮     │
 │     │          │            │     │
 │     v E        v F          v G   │ 
 │     │          │            │     │
 ├─RESPONDED  (TIMED_OUT)   (FAILED) │
 │     │                      │  │   │
 │     │                      ^  │   │
 │     │                      │  │   │
 ╰──── │ ─────────────────────╯  │   │
       │                         │   │
       ├───────────>─────────────╯   │
       │                             │
       v H                           v I
       │                             │
   CONVERTED                         │
       │                             │
       v J                           │
       │                             │
       ├─────╮                       │
       │     │                       │
     CACHED  │                       │
       │     │                       │
     K v     v                       │
       │     │                       │
   (SUCCESS)─┴──────────<────────────╯

*/

export enum State {
  NEW = 1,
  ENQUEUED,
  DEQUEUED,
  SENT,
  CACHE_HIT,
  RESPONDED,
  TIMED_OUT,
  FAILED,
  CONVERTED,
  CACHED,
  SUCCESS,
}

export interface UntypedRequest {
  state(): State;
}

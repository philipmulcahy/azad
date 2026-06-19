/* Copyright(c) 2026 Philip Mulcahy. */

/**
 * Wraps a promise with a timeout.
 * @param promise - The original promise to wait for.
 * @param ms - The timeout duration in milliseconds.
 * @returns A promise that resolves/rejects with the original promise, 
 * or rejects if the timeout is reached first.
 */
export function wrapPromise<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Promise timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  });
}

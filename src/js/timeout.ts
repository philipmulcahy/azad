/* Copyright(c) 2026 Philip Mulcahy. */

/**
 * Wraps a promise with a timeout.
 * @param promise - The original promise to wait for.
 * @param ms - The timeout duration in milliseconds.
 * @returns A promise that resolves/rejects with the original promise, 
 * or rejects if the timeout is reached first.
 */
export function wrapPromise<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Create a promise that rejects after the specified milliseconds
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Promise timed out after ${ms}ms`));
    }, ms);
  });

  // Race the original promise against the timeout
  return Promise.race([promise, timeoutPromise]);
}

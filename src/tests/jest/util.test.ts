import * as util from '../../js/util';

describe(
  'numeric conversion',
  () => {
    test(
      'float parsing',
      () => {
        expect(util.floatVal('-£16.92')).toBeCloseTo(-16.92, 2);
      }
    );
  }
);

import { stringifyError } from '../../js/util';

describe('stringifyError', () => {
  // 1. Error Objects (The big one!)
  test('should extract stack trace from a native Error object', () => {
    const error = new Error('Something went wrong');
    const result = stringifyError(error);

    expect(result).toContain('Error: Something went wrong');
    expect(result).toContain('at '); // Confirms stack trace lines are present
  });

  test('should fall back to message if stack is missing', () => {
    const error = new Error('No stack here');
    delete error.stack; // Force stack to be missing

    expect(stringifyError(error)).toBe('No stack here');
  });

  // 2. Primitives
  test('should return a plain string as-is without extra quotes', () => {
    const str = 'this is an error string';
    expect(stringifyError(str)).toBe('this is an error string');
  });

  test('should convert numbers and booleans to strings', () => {
    expect(stringifyError(404)).toBe('404');
    expect(stringifyError(false)).toBe('false');
  });

  test('should handle null and undefined explicitly', () => {
    expect(stringifyError(null)).toBe('null');
    expect(stringifyError(undefined)).toBe('undefined');
  });

  // 3. Objects & Arrays
  test('should serialize plain objects to JSON', () => {
    const obj = { code: 'ECONNRESET', status: 500 };
    expect(stringifyError(obj)).toBe('{"code":"ECONNRESET","status":500}');
  });

  test('should serialize arrays to JSON', () => {
    const arr = ['error 1', 'error 2'];
    expect(stringifyError(arr)).toBe('["error 1","error 2"]');
  });

  // 4. Edge Cases / Defenses
  test('should gracefully handle circular references without crashing', () => {
    const circularObj: Record<string, unknown> = { name: 'Oops', self: null };
    circularObj.self = circularObj; // Creates a circular reference that breaks JSON.stringify

    const result = stringifyError(circularObj);
    expect(result).toContain('[Unserializable Object:');
    expect(result).toContain('Object');
  });
});

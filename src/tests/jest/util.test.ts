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

/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  maxWorkers: 1,
  roots: [
    "src/tests/selenium",
  ],
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
  testTimeout: 120000,
};

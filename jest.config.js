/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  roots: [
    "src/tests/jest",
  ],
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
};

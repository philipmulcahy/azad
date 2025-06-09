/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  roots: [
    "src/tests/",
  ],
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
};

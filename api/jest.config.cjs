module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/db/migrations/**', '!src/db/seeds/**'],
  coverageThreshold: { global: { lines: 0, functions: 0 } }
};

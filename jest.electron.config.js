const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  displayName: 'electron',
  testMatch: ['**/__tests__/electron/**/*.test.{js,ts}'],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'electron/**/*.{js,ts}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ]
};

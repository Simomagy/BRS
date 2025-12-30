const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  displayName: 'frontend',
  testMatch: ['**/__tests__/frontend/**/*.test.{ts,tsx}'],
  testEnvironment: 'jsdom',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!**/node_modules/**'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup/test-utils.ts',
    '@testing-library/jest-dom'
  ]
};

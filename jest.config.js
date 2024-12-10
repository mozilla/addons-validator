/** @type {import('jest').Config} */
module.exports = {
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/tests/',
    '<rootDir>/config/',
  ],
  collectCoverageFrom: ['src/**/*.js'],
  moduleDirectories: ['src', 'vendor', 'node_modules'],
  moduleFileExtensions: ['js', 'json'],
  moduleNameMapper: {
    // Alias tests for tests to be able to import helpers.
    '^tests/(.*)$': '<rootDir>/tests/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/tests/fixtures/',
    '<rootDir>/(bin|coverage|dist|docs|src)/',
    '<rootDir>/vendor/',
    '<rootDir>/web-ext/',
  ],
  testMatch: [
    '<rootDir>/**/[Tt]est(*).js?(x)',
    '<rootDir>/**/__tests__/**/*.js?(x)',
  ],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.txt$': '<rootDir>/tests/jest-raw-loader.js',
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!os-locale)'],
  testEnvironment: 'node',
  verbose: false,
};

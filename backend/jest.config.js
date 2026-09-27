/** Tests : unitaires (domaine) et e2e (API sur base de test dédiée). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/env.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
  testTimeout: 60000,
};

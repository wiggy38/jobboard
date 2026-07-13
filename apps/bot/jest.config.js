/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }],
  },
  moduleNameMapper: {
    '^ioredis$': '<rootDir>/node_modules/ioredis-mock',
    '^@tumaa/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@tumaa/db$': '<rootDir>/../../packages/db/src/index.ts',
  },
};

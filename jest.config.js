module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^loader/(.*)$': '<rootDir>/src/loader/$1',
    '^middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^config$': '<rootDir>/src/config',
    '^config/(.*)$': '<rootDir>/src/config/$1',
    '^database/(.*)$': '<rootDir>/src/database/$1',
    '^artifacts/abis/types$': '<rootDir>/src/artifacts/abis/types',
    '^utils/(.*)$': '<rootDir>/src/utils/$1',
    '^typings/(.*)$': '<rootDir>/src/typings/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['**/__tests__/**/*.test.(ts|js)'],
};

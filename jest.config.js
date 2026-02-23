module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.js'],
    collectCoverageFrom: [
        'app.js',
        'main.js',
        '!node_modules/**',
        '!dist/**',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'clover'],
    // Functional tests have longer timeout (Electron launch)
    projects: [
        {
            displayName: 'unit',
            testEnvironment: 'jsdom',
            testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
        },
        {
            displayName: 'functional',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/tests/functional/**/*.test.js'],
        },
    ],
};

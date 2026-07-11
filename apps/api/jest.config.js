/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.spec.json" }] },
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  clearMocks: true,
  // Integration specs share a Postgres schema; run serially to avoid cross-test races.
  maxWorkers: 1,
};

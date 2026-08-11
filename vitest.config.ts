// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The corpus root is read from FUNNEL_BASE_ROOT at module-evaluation time,
    // so the filesystem suites set the variable and then dynamically import the
    // loader. Isolation keeps one suite's root from leaking into the next.
    isolate: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
    },
  },
});

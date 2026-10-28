import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A scratch dist dir (`NEXT_DIST_DIR=.next-build next build`) is used to
    // sidestep OneDrive file locks on `.next`. It is build output, not source.
    ".next-*/**",
    // Coverage report assets are generated, not authored.
    "coverage/**",
  ]),
]);

export default eslintConfig;

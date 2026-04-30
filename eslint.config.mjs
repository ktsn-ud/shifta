import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 現在のフォーム/フェッチ実装は effect 内 state 更新を前提としており、
      // 一律適用すると挙動変更リスクの高い大規模改修が必要になるため段階移行とする。
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Keep this last so style rules conflicting with Prettier are disabled.
  prettier,
]);

export default eslintConfig;

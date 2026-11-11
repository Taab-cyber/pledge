import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// UI code may only talk to the backend through src/sdk.
const serverImportBan = {
  group: ["@/server", "@/server/**", "**/server/**"],
  message: "UI code must not import src/server. Use the typed client in src/sdk instead.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/(ui)/**", "src/app/layout.tsx", "src/components/**", "src/sdk/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [serverImportBan] }] },
  },
  {
    // Domain logic stays pure: no framework, database or provider imports.
    files: ["src/server/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/**",
                "react",
                "@supabase/**",
                "@/server/providers/**",
                "**/providers/**",
                "@/server/repos/**",
                "**/repos/**",
                "@/server/services/**",
                "**/services/**",
              ],
              message:
                "src/server/domain must stay pure (no Next.js, Supabase, providers, repos or services).",
            },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;

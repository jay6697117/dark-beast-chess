import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "scripts/vendor/**"],
  },
  {
    files: ["*.js", "scripts/**/*.js", "server/**/*.js", "shared/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { "args": "none", "ignoreRestSiblings": true }],
      "no-console": "off",
    },
  },
];

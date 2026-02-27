//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const nextPlugin = require("@next/eslint-plugin-next");
const {
  getEslintNodeConfig,
} = require("@stanfordspezi/spezi-web-configurations");

module.exports = [
  ...getEslintNodeConfig({ tsconfigRootDir: __dirname }),
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    files: ["next-env.d.ts"],
    rules: {
      "import/extensions": "off",
      "import/no-unresolved": "off",
    },
  },
];

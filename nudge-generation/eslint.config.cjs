//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const { getEslintNodeConfig } = require('@stanfordspezi/spezi-web-configurations')

module.exports = [
  ...getEslintNodeConfig({ tsconfigRootDir: __dirname }),
  {
    ignores: ['node_modules/**/*', 'dist/**/*', 'python_service/**/*'],
  },
]

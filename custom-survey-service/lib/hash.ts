//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createHash } from "node:crypto";

export function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashToFloat(input: string): number {
  const hex = stableHash(input).slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
}

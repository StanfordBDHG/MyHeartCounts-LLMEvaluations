//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createHash } from "node:crypto";

export const stableHash = (input: string): string =>
  createHash("sha256").update(input).digest("hex");

export const hashToFloat = (input: string): number => {
  // Use the first 48 bits of SHA-256 and normalize by max 48-bit value (inclusive [0, 1]).
  const hex = stableHash(input).slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
};

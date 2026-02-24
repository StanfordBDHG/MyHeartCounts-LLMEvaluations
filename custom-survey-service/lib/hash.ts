import { createHash } from "node:crypto";

export function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashToFloat(input: string): number {
  const hex = stableHash(input).slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
}

//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  BUNDLE_A,
  BUNDLE_A_NAME,
  BUNDLE_B,
  BUNDLE_B_NAME,
  DEFAULT_NUDGES_PER_SESSION,
  GLOBAL_ASSIGNMENT_SALT
} from "@/lib/constants";
import { hashToFloat, stableHash } from "@/lib/hash";
import type { NudgeRow } from "@/types/db";

type BundleChoice = { id: string; name: string };

type BundleCountRow = {
  bundle_id: string;
  count: number;
};

type NudgeExposureRow = {
  nudge_id: string;
  count: number;
};

function deterministicScore(base: string): number {
  return hashToFloat(base);
}

export async function chooseBundle(args: {
  evaluatorId: string;
  evaluatorSessionCount: number;
  bundleCounts: BundleCountRow[];
}): Promise<BundleChoice> {
  const countA = args.bundleCounts.find((x) => x.bundle_id === BUNDLE_A)?.count ?? 0;
  const countB = args.bundleCounts.find((x) => x.bundle_id === BUNDLE_B)?.count ?? 0;

  if (countA < countB) {
    return { id: BUNDLE_A, name: BUNDLE_A_NAME };
  }
  if (countB < countA) {
    return { id: BUNDLE_B, name: BUNDLE_B_NAME };
  }

  const tieA = deterministicScore(
    `${args.evaluatorId}:${args.evaluatorSessionCount}:${GLOBAL_ASSIGNMENT_SALT}:${BUNDLE_A}`
  );
  const tieB = deterministicScore(
    `${args.evaluatorId}:${args.evaluatorSessionCount}:${GLOBAL_ASSIGNMENT_SALT}:${BUNDLE_B}`
  );

  return tieA <= tieB
    ? { id: BUNDLE_A, name: BUNDLE_A_NAME }
    : { id: BUNDLE_B, name: BUNDLE_B_NAME };
}

export function chooseNudges(args: {
  evaluatorId: string;
  evaluatorSessionCount: number;
  allNudges: NudgeRow[];
  globalExposureCounts: NudgeExposureRow[];
  previouslySeenNudgeIds: Set<string>;
  n?: number;
}): NudgeRow[] {
  const nudgeCount = args.n ?? DEFAULT_NUDGES_PER_SESSION;
  const exposureMap = new Map(
    args.globalExposureCounts.map((row) => [row.nudge_id, row.count])
  );

  const unseenFirst = args.allNudges.filter(
    (nudge) => !args.previouslySeenNudgeIds.has(nudge.id)
  );
  const candidatePool =
    unseenFirst.length >= nudgeCount ? unseenFirst : args.allNudges.slice();

  return candidatePool
    .slice()
    .sort((left, right) => {
      const leftCount = exposureMap.get(left.id) ?? 0;
      const rightCount = exposureMap.get(right.id) ?? 0;

      if (leftCount !== rightCount) {
        return leftCount - rightCount;
      }

      const leftTie = deterministicScore(
        `${args.evaluatorId}:${args.evaluatorSessionCount}:${GLOBAL_ASSIGNMENT_SALT}:${left.id}`
      );
      const rightTie = deterministicScore(
        `${args.evaluatorId}:${args.evaluatorSessionCount}:${GLOBAL_ASSIGNMENT_SALT}:${right.id}`
      );

      if (leftTie !== rightTie) {
        return leftTie - rightTie;
      }

      return stableHash(left.id).localeCompare(stableHash(right.id));
    })
    .slice(0, nudgeCount);
}

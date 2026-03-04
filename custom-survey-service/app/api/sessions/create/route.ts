//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { NextResponse } from "next/server";
import { z } from "zod";
import { chooseBundle, chooseNudges } from "@/lib/assignment/engine";
import { verifyEvaluatorCredentials } from "@/lib/auth";
import {
  BUNDLE_A,
  DEFAULT_NUDGES_PER_SESSION,
  getAssignmentSalt,
} from "@/lib/constants";
import { getServiceClient } from "@/lib/db/server";
import { hashToFloat } from "@/lib/hash";
import type { NudgeRow } from "@/types/db";

const bodySchema = z.object({
  email: z.email(),
  evaluatorId: z.string().min(3),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
});

interface QuestionRow {
  id: string;
  stable_key: string;
  position_index: number;
}

interface SessionBundleRow {
  bundle_id: string;
}

interface SessionNudgeRow {
  nudge_id: string;
}

interface QuestionBundleItemRow {
  question_id: string;
  position_index: number;
}

interface ActiveQuestionRow {
  id: string;
  stable_key: string;
}

interface SessionRow {
  id: string;
}

const deterministicRank = (seed: string): number => hashToFloat(seed);

const orderQuestionsForSession = (args: {
  bundleId: string;
  evaluatorId: string;
  evaluatorSessionCount: number;
  questions: QuestionRow[];
}): QuestionRow[] => {
  const assignmentSalt = getAssignmentSalt();
  const tieBreak = (leftKey: string, rightKey: string): number =>
    leftKey.localeCompare(rightKey);

  // Bundle A: shuffle CI/AP pairs together, CI always before AP, ap_general always last.
  if (args.bundleId === BUNDLE_A) {
    const byStableKey = new Map(
      args.questions.map((question) => [question.stable_key, question]),
    );
    const pairSpecs = [
      ["ci_gender", "ap_gender"],
      ["ci_age", "ap_age"],
      ["ci_comorbidity", "ap_comorbidity"],
      ["ci_stage_change", "ap_stage_change"],
      ["ci_workout_pref", "ap_workout_pref"],
      ["ci_notification_time", "ap_notification_time"],
    ] as const;

    const used = new Set<string>();
    const pairGroups: QuestionRow[][] = [];

    for (const [ciKey, apKey] of pairSpecs) {
      const ci = byStableKey.get(ciKey);
      const ap = byStableKey.get(apKey);
      if (ci && ap) {
        pairGroups.push([ci, ap]);
        used.add(ci.stable_key);
        used.add(ap.stable_key);
      }
    }

    const shuffledPairs = pairGroups
      .map((group) => ({
        group,
        rank: deterministicRank(
          `${args.evaluatorId}:${args.evaluatorSessionCount}:${assignmentSalt}:pair:${group[0].stable_key}`,
        ),
      }))
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }
        return tieBreak(left.group[0].stable_key, right.group[0].stable_key);
      })
      .flatMap((entry) => entry.group);

    const general = byStableKey.get("ap_general");
    if (general) {
      used.add(general.stable_key);
    }

    const leftovers = args.questions
      .filter((question) => !used.has(question.stable_key))
      .map((question) => ({
        question,
        rank: deterministicRank(
          `${args.evaluatorId}:${args.evaluatorSessionCount}:${assignmentSalt}:question:${question.stable_key}`,
        ),
      }))
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }
        return tieBreak(left.question.stable_key, right.question.stable_key);
      })
      .map((entry) => entry.question);

    return general
      ? [...shuffledPairs, ...leftovers, general]
      : [...shuffledPairs, ...leftovers];
  }

  // Other bundles: randomize individual questions.
  return args.questions
    .map((question) => ({
      question,
      rank: deterministicRank(
        `${args.evaluatorId}:${args.evaluatorSessionCount}:${assignmentSalt}:question:${question.stable_key}`,
      ),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return tieBreak(left.question.stable_key, right.question.stable_key);
    })
    .map((entry) => entry.question);
};

export const POST = async (request: Request) => {
  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const evaluator = await verifyEvaluatorCredentials(
    parsed.data.email,
    parsed.data.evaluatorId,
    parsed.data.firstName,
    parsed.data.lastName,
  );
  if (!evaluator) {
    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401 },
    );
  }

  const supabase = getServiceClient();

  const [
    { count: evaluatorSessionCount },
    { data: allNudges, error: nudgeError },
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("evaluator_id", evaluator.id)
      .not("completed_at", "is", null),
    supabase
      .from("nudges")
      .select("id, title, body, source_model, metadata_json, active")
      .eq("active", true),
  ]);
  const evaluatorSessionCountNumber = evaluatorSessionCount ?? 0;
  const allNudgesRows = (allNudges ?? []) as NudgeRow[];

  if (nudgeError || allNudgesRows.length < DEFAULT_NUDGES_PER_SESSION) {
    return NextResponse.json(
      { error: "Not enough active nudges to create a session." },
      { status: 400 },
    );
  }

  const [
    { data: bundleRows },
    { data: globalNudgeRows },
    { data: seenNudges },
  ] = await Promise.all([
    supabase
      .from("session_bundle")
      .select("bundle_id, sessions!inner(id)")
      .not("sessions.completed_at", "is", null),
    supabase
      .from("session_nudges")
      .select("nudge_id, sessions!inner(id)")
      .not("sessions.completed_at", "is", null),
    supabase
      .from("session_nudges")
      .select("nudge_id, sessions!inner(id)")
      .eq("evaluator_id", evaluator.id)
      .not("sessions.completed_at", "is", null),
  ]);

  const bundleRowsData = (bundleRows ?? []) as SessionBundleRow[];
  const globalNudgeRowsData = (globalNudgeRows ?? []) as SessionNudgeRow[];
  const seenNudgeRowsData = (seenNudges ?? []) as SessionNudgeRow[];

  const bundleCountMap = new Map<string, number>();
  for (const row of bundleRowsData) {
    bundleCountMap.set(
      row.bundle_id,
      (bundleCountMap.get(row.bundle_id) ?? 0) + 1,
    );
  }
  const bundleCounts = Array.from(bundleCountMap.entries()).map(
    ([bundle_id, count]) => ({
      bundle_id,
      count,
    }),
  );

  const nudgeCountMap = new Map<string, number>();
  for (const row of globalNudgeRowsData) {
    nudgeCountMap.set(row.nudge_id, (nudgeCountMap.get(row.nudge_id) ?? 0) + 1);
  }
  const globalNudgeExposure = Array.from(nudgeCountMap.entries()).map(
    ([nudge_id, count]) => ({
      nudge_id,
      count,
    }),
  );

  const chosenNudges = chooseNudges({
    evaluatorId: evaluator.id,
    evaluatorSessionCount: evaluatorSessionCountNumber,
    allNudges: allNudgesRows,
    globalExposureCounts: globalNudgeExposure,
    previouslySeenNudgeIds: new Set(
      seenNudgeRowsData.map((row) => row.nudge_id),
    ),
  });

  const bundleChoice = chooseBundle({
    evaluatorId: evaluator.id,
    evaluatorSessionCount: evaluatorSessionCountNumber,
    bundleCounts,
  });

  const { data: bundleItems, error: sessionQuestionError } = await supabase
    .from("question_bundle_items")
    .select("question_id, position_index")
    .eq("bundle_id", bundleChoice.id)
    .order("position_index", { ascending: true });

  if (sessionQuestionError) {
    return NextResponse.json(
      { error: "Failed to resolve bundle questions." },
      { status: 500 },
    );
  }

  const bundleItemsRows = bundleItems as QuestionBundleItemRow[];

  const questionIds = bundleItemsRows.map((item) => item.question_id);
  const { data: activeQuestionRows, error: activeQuestionError } =
    await supabase
      .from("questions")
      .select("id, stable_key")
      .in("id", questionIds)
      .eq("active", true);

  if (activeQuestionError) {
    return NextResponse.json(
      { error: "Failed to resolve active questions." },
      { status: 500 },
    );
  }

  const activeQuestionRowsData = activeQuestionRows as ActiveQuestionRow[];
  const byQuestionId = new Map(
    activeQuestionRowsData.map((row) => [row.id, row] as const),
  );
  const activeBundleQuestions: QuestionRow[] = bundleItemsRows
    .map((item) => {
      const question = byQuestionId.get(item.question_id);
      if (!question) {
        return null;
      }
      return {
        id: question.id,
        stable_key: question.stable_key,
        position_index: item.position_index,
      };
    })
    .filter((item): item is QuestionRow => Boolean(item));

  const sessionQuestions = orderQuestionsForSession({
    bundleId: bundleChoice.id,
    evaluatorId: evaluator.id,
    evaluatorSessionCount: evaluatorSessionCountNumber,
    questions: activeBundleQuestions,
  });

  if (sessionQuestions.length === 0) {
    return NextResponse.json(
      { error: "No active questions are enabled for this bundle." },
      { status: 400 },
    );
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      evaluator_id: evaluator.id,
      seed: `${evaluator.id}:${evaluatorSessionCountNumber + 1}`,
    })
    .select("id")
    .single();

  if (sessionError) {
    return NextResponse.json(
      { error: "Failed to create session." },
      { status: 500 },
    );
  }

  const createdSession = sessionRow as SessionRow;
  const inserts = (await Promise.all([
    supabase.from("session_bundle").insert({
      session_id: createdSession.id,
      evaluator_id: evaluator.id,
      bundle_id: bundleChoice.id,
    }),
    supabase.from("session_nudges").insert(
      chosenNudges.map((nudge, index) => ({
        session_id: createdSession.id,
        evaluator_id: evaluator.id,
        nudge_id: nudge.id,
        position_index: index + 1,
      })),
    ),
    supabase.from("session_questions").insert(
      sessionQuestions.map((question, index) => ({
        session_id: createdSession.id,
        question_id: question.id,
        position_index: index + 1,
      })),
    ),
  ])) as Array<{ error: unknown }>;

  if (inserts.some((result) => result.error)) {
    return NextResponse.json(
      { error: "Failed to finalize session assignments." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sessionId: createdSession.id,
    bundleId: bundleChoice.id,
  });
};

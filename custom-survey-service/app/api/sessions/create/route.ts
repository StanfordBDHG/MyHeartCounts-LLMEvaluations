//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEvaluatorCredentials } from "@/lib/auth";
import { chooseBundle, chooseNudges } from "@/lib/assignment/engine";
import { BUNDLE_A, GLOBAL_ASSIGNMENT_SALT } from "@/lib/constants";
import { getServiceClient } from "@/lib/db/server";
import { hashToFloat } from "@/lib/hash";
import type { NudgeRow } from "@/types/db";

const bodySchema = z.object({
  email: z.string().email(),
  evaluatorId: z.string().min(3)
});

type QuestionRow = {
  id: string;
  stable_key: string;
  position_index: number;
};

function deterministicRank(seed: string): number {
  return hashToFloat(seed);
}

function orderQuestionsForSession(args: {
  bundleId: string;
  evaluatorId: string;
  evaluatorSessionCount: number;
  questions: QuestionRow[];
}): QuestionRow[] {
  const tieBreak = (leftKey: string, rightKey: string): number =>
    leftKey.localeCompare(rightKey);

  // Bundle A: shuffle CI/AP pairs together, CI always before AP, ap_general always last.
  if (args.bundleId === BUNDLE_A) {
    const byStableKey = new Map(args.questions.map((question) => [question.stable_key, question]));
    const pairSpecs = [
      ["ci_gender", "ap_gender"],
      ["ci_age", "ap_age"],
      ["ci_comorbidity", "ap_comorbidity"],
      ["ci_stage_change", "ap_stage_change"],
      ["ci_workout_pref", "ap_workout_pref"],
      ["ci_notification_time", "ap_notification_time"]
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
          `${args.evaluatorId}:${args.evaluatorSessionCount}:${GLOBAL_ASSIGNMENT_SALT}:pair:${group[0].stable_key}`
        )
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
          `${args.evaluatorId}:${args.evaluatorSessionCount}:${GLOBAL_ASSIGNMENT_SALT}:question:${question.stable_key}`
        )
      }))
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }
        return tieBreak(left.question.stable_key, right.question.stable_key);
      })
      .map((entry) => entry.question);

    return general ? [...shuffledPairs, ...leftovers, general] : [...shuffledPairs, ...leftovers];
  }

  // Other bundles: randomize individual questions.
  return args.questions
    .map((question) => ({
      question,
      rank: deterministicRank(
        `${args.evaluatorId}:${args.evaluatorSessionCount}:${GLOBAL_ASSIGNMENT_SALT}:question:${question.stable_key}`
      )
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return tieBreak(left.question.stable_key, right.question.stable_key);
    })
    .map((entry) => entry.question);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const evaluator = await verifyEvaluatorCredentials(
    parsed.data.email,
    parsed.data.evaluatorId
  );
  if (!evaluator) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const supabase = getServiceClient();

  const [{ count: evaluatorSessionCount = 0 }, { data: allNudges, error: nudgeError }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("evaluator_id", evaluator.id),
      supabase
        .from("nudges")
        .select("id, title, body, source_model, metadata_json, active")
        .eq("active", true)
    ]);
  const evaluatorSessionCountNumber = evaluatorSessionCount ?? 0;

  if (nudgeError || !allNudges || allNudges.length < 3) {
    return NextResponse.json(
      { error: "Not enough active nudges to create a session." },
      { status: 400 }
    );
  }

  const [{ data: bundleRows }, { data: globalNudgeRows }, { data: seenNudges }] =
    await Promise.all([
      supabase.from("session_bundle").select("bundle_id"),
      supabase.from("session_nudges").select("nudge_id"),
      supabase
        .from("session_nudges")
        .select("nudge_id")
        .eq("evaluator_id", evaluator.id)
    ]);

  const bundleCountMap = new Map<string, number>();
  for (const row of bundleRows ?? []) {
    bundleCountMap.set(row.bundle_id, (bundleCountMap.get(row.bundle_id) ?? 0) + 1);
  }
  const bundleCounts = Array.from(bundleCountMap.entries()).map(([bundle_id, count]) => ({
    bundle_id,
    count
  }));

  const nudgeCountMap = new Map<string, number>();
  for (const row of globalNudgeRows ?? []) {
    nudgeCountMap.set(row.nudge_id, (nudgeCountMap.get(row.nudge_id) ?? 0) + 1);
  }
  const globalNudgeExposure = Array.from(nudgeCountMap.entries()).map(
    ([nudge_id, count]) => ({
      nudge_id,
      count
    })
  );

  const bundleChoice = await chooseBundle({
    evaluatorId: evaluator.id,
    evaluatorSessionCount: evaluatorSessionCountNumber,
    bundleCounts
  });

  const chosenNudges = chooseNudges({
    evaluatorId: evaluator.id,
    evaluatorSessionCount: evaluatorSessionCountNumber,
    allNudges: allNudges as NudgeRow[],
    globalExposureCounts: globalNudgeExposure,
    previouslySeenNudgeIds: new Set((seenNudges ?? []).map((row) => row.nudge_id))
  });

  const { data: bundleItems, error: sessionQuestionError } = await supabase
    .from("question_bundle_items")
    .select("question_id, position_index")
    .eq("bundle_id", bundleChoice.id)
    .order("position_index", { ascending: true });

  if (sessionQuestionError || !bundleItems) {
    return NextResponse.json(
      { error: "Failed to resolve bundle questions." },
      { status: 500 }
    );
  }

  const questionIds = bundleItems.map((item) => item.question_id);
  const { data: activeQuestionRows, error: activeQuestionError } = await supabase
    .from("questions")
    .select("id, stable_key")
    .in("id", questionIds)
    .eq("active", true);

  if (activeQuestionError || !activeQuestionRows) {
    return NextResponse.json(
      { error: "Failed to resolve active questions." },
      { status: 500 }
    );
  }

  const byQuestionId = new Map(
    activeQuestionRows.map((row) => [row.id, row] as const)
  );
  const activeBundleQuestions: QuestionRow[] = bundleItems
    .map((item) => {
      const question = byQuestionId.get(item.question_id);
      if (!question) {
        return null;
      }
      return {
        id: question.id,
        stable_key: question.stable_key,
        position_index: item.position_index
      };
    })
    .filter((item): item is QuestionRow => Boolean(item));

  const sessionQuestions = orderQuestionsForSession({
    bundleId: bundleChoice.id,
    evaluatorId: evaluator.id,
    evaluatorSessionCount: evaluatorSessionCountNumber,
    questions: activeBundleQuestions
  });

  if (sessionQuestions.length === 0) {
    return NextResponse.json(
      { error: "No active questions are enabled for this bundle." },
      { status: 400 }
    );
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      evaluator_id: evaluator.id,
      seed: `${evaluator.id}:${evaluatorSessionCountNumber + 1}`
    })
    .select("id")
    .single();

  if (sessionError || !sessionRow) {
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }

  const inserts = await Promise.all([
    supabase.from("session_bundle").insert({
      session_id: sessionRow.id,
      evaluator_id: evaluator.id,
      bundle_id: bundleChoice.id
    }),
    supabase.from("session_nudges").insert(
      chosenNudges.map((nudge, index) => ({
        session_id: sessionRow.id,
        evaluator_id: evaluator.id,
        nudge_id: nudge.id,
        position_index: index + 1
      }))
    ),
    supabase.from("session_questions").insert(
      sessionQuestions.map((question, index) => ({
        session_id: sessionRow.id,
        question_id: question.id,
        position_index: index + 1
      }))
    )
  ]);

  if (inserts.some((result) => result.error)) {
    return NextResponse.json(
      { error: "Failed to finalize session assignments." },
      { status: 500 }
    );
  }

  return NextResponse.json({ sessionId: sessionRow.id, bundleId: bundleChoice.id });
}

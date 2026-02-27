//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/server";

interface SessionRow {
  id: string;
  evaluator_id: string;
}

interface BundleRelation {
  name: string;
}

interface BundleRow {
  bundle_id: string;
  question_bundles: BundleRelation | BundleRelation[] | null;
}

interface NudgeRow {
  id: string;
  title: string;
  body: string;
  metadata_json: Record<string, unknown>;
}

interface SessionNudgeRow {
  position_index: number;
  nudges: NudgeRow | NudgeRow[] | null;
}

interface QuestionRow {
  id: string;
  stable_key: string;
  axis: string;
  prompt_text: string;
  body_markdown: string;
  response_type: "likert_1_7" | "yes_no";
}

interface SessionQuestionRow {
  position_index: number;
  questions: QuestionRow | QuestionRow[] | null;
}

const oneOrNull = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
};

export const GET = async (
  _: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const { id } = await context.params;
  const supabase = getServiceClient();

  const [
    { data: session },
    { data: bundle },
    { data: nudges },
    { data: questions },
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, evaluator_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("session_bundle")
      .select("bundle_id, question_bundles(name)")
      .eq("session_id", id)
      .maybeSingle(),
    supabase
      .from("session_nudges")
      .select("position_index, nudges(id, title, body, metadata_json)")
      .eq("session_id", id)
      .order("position_index", { ascending: true }),
    supabase
      .from("session_questions")
      .select(
        "position_index, questions(id, stable_key, axis, prompt_text, body_markdown, response_type)",
      )
      .eq("session_id", id)
      .order("position_index", { ascending: true }),
  ]);

  if (!session || !bundle || !nudges || !questions) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const typedSession = session as SessionRow;
  const typedBundle = bundle as BundleRow;
  const typedNudges = nudges as SessionNudgeRow[];
  const typedQuestions = questions as SessionQuestionRow[];

  const responsePayload = {
    sessionId: typedSession.id,
    evaluatorId: typedSession.evaluator_id,
    bundle: {
      id: typedBundle.bundle_id,
      name: oneOrNull(typedBundle.question_bundles)?.name ?? "Unknown",
    },
    nudges: typedNudges
      .map((row) => {
        const nudge = oneOrNull(row.nudges);
        if (!nudge) {
          return null;
        }
        return {
          ...nudge,
          position_index: row.position_index,
        };
      })
      .filter(
        (
          value,
        ): value is {
          id: string;
          title: string;
          body: string;
          metadata_json: Record<string, unknown>;
          position_index: number;
        } => Boolean(value),
      ),
    questions: typedQuestions
      .map((row) => {
        const question = oneOrNull(row.questions);
        if (!question) {
          return null;
        }
        return {
          ...question,
          position_index: row.position_index,
        };
      })
      .filter(
        (
          value,
        ): value is {
          id: string;
          stable_key: string;
          axis: string;
          prompt_text: string;
          body_markdown: string;
          response_type: "likert_1_7" | "yes_no";
          position_index: number;
        } => Boolean(value),
      ),
  };

  return NextResponse.json(responsePayload);
};

//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/db/server";

const responseSchema = z.object({
  questionId: z.uuid(),
  nudgeId: z.uuid(),
  score: z.number().int().min(1).max(7),
});

const bodySchema = z.object({
  sessionId: z.uuid(),
  evaluatorId: z.uuid(),
  responses: z.array(responseSchema).min(1),
});

interface SessionOwnershipRow {
  id: string;
  evaluator_id: string;
}

interface SessionQuestionRow {
  question_id: string;
}

interface SessionNudgeRow {
  nudge_id: string;
}

export const POST = async (request: Request) => {
  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .select("id, evaluator_id")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();

  if (sessionError || !sessionRow) {
    return NextResponse.json({ error: "Session not found." }, { status: 403 });
  }

  const ownedSession = sessionRow as SessionOwnershipRow;
  if (ownedSession.evaluator_id !== parsed.data.evaluatorId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [{ data: assignedQuestions }, { data: assignedNudges }] =
    await Promise.all([
      supabase
        .from("session_questions")
        .select("question_id")
        .eq("session_id", parsed.data.sessionId),
      supabase
        .from("session_nudges")
        .select("nudge_id")
        .eq("session_id", parsed.data.sessionId)
        .eq("evaluator_id", parsed.data.evaluatorId),
    ]);

  const allowedQuestionIds = new Set(
    ((assignedQuestions ?? []) as SessionQuestionRow[]).map(
      (entry) => entry.question_id,
    ),
  );
  const allowedNudgeIds = new Set(
    ((assignedNudges ?? []) as SessionNudgeRow[]).map(
      (entry) => entry.nudge_id,
    ),
  );

  const validatedResponses = parsed.data.responses.filter(
    (entry) =>
      allowedQuestionIds.has(entry.questionId) &&
      allowedNudgeIds.has(entry.nudgeId),
  );

  if (validatedResponses.length === 0) {
    return NextResponse.json(
      { error: "No valid responses for this session." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("responses").upsert(
    validatedResponses.map((entry) => ({
      session_id: parsed.data.sessionId,
      evaluator_id: parsed.data.evaluatorId,
      question_id: entry.questionId,
      nudge_id: entry.nudgeId,
      score_int: entry.score,
    })),
    { onConflict: "session_id,evaluator_id,question_id,nudge_id" },
  );

  if (error) {
    return NextResponse.json(
      { error: "Could not store responses." },
      { status: 500 },
    );
  }

  const { error: completionError } = await supabase
    .from("sessions")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", parsed.data.sessionId);

  if (completionError) {
    console.error("Failed to mark session complete in responses/bulk POST", {
      sessionId: parsed.data.sessionId,
      evaluatorId: parsed.data.evaluatorId,
      error: completionError,
    });
    return NextResponse.json(
      { error: "Responses saved, but session completion failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
};

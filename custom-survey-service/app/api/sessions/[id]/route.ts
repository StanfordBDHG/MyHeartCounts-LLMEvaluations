//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/server";

function oneOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = getServiceClient();

  const [{ data: session }, { data: bundle }, { data: nudges }, { data: questions }] =
    await Promise.all([
      supabase.from("sessions").select("id, evaluator_id").eq("id", id).maybeSingle(),
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
        .select("position_index, questions(id, stable_key, axis, prompt_text, body_markdown, response_type)")
        .eq("session_id", id)
        .order("position_index", { ascending: true })
    ]);

  if (!session || !bundle || !nudges || !questions) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const responsePayload = {
    sessionId: session.id,
    evaluatorId: session.evaluator_id,
    bundle: {
      id: bundle.bundle_id,
      name:
        oneOrNull(bundle.question_bundles as { name: string } | { name: string }[] | null)
          ?.name ?? "Unknown"
    },
    nudges: nudges
      .map((row) => {
        const nudge = oneOrNull(
          row.nudges as
            | {
                id: string;
                title: string;
                body: string;
                metadata_json: Record<string, unknown>;
              }
            | Array<{
                id: string;
                title: string;
                body: string;
                metadata_json: Record<string, unknown>;
              }>
            | null
        );
        if (!nudge) {
          return null;
        }
        return {
          ...nudge,
          position_index: row.position_index
        };
      })
      .filter(
        (
          value
        ): value is {
          id: string;
          title: string;
          body: string;
          metadata_json: Record<string, unknown>;
          position_index: number;
        } => Boolean(value)
      ),
    questions: questions
      .map((row) => {
        const question = oneOrNull(
          row.questions as
            | {
                id: string;
                stable_key: string;
                axis: string;
                prompt_text: string;
                body_markdown: string;
                response_type: "likert_1_7" | "yes_no";
              }
            | Array<{
                id: string;
                stable_key: string;
                axis: string;
                prompt_text: string;
                body_markdown: string;
                response_type: "likert_1_7" | "yes_no";
              }>
            | null
        );
        if (!question) {
          return null;
        }
        return {
          ...question,
          position_index: row.position_index
        };
      })
      .filter(
        (value): value is {
          id: string;
          stable_key: string;
          axis: string;
          prompt_text: string;
          body_markdown: string;
          response_type: "likert_1_7" | "yes_no";
          position_index: number;
        } => Boolean(value)
      )
  };

  return NextResponse.json(responsePayload);
}

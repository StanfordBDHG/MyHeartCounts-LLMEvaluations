import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/db/server";

const responseSchema = z.object({
  questionId: z.string().uuid(),
  nudgeId: z.string().uuid(),
  score: z.number().int().min(1).max(7)
});

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  evaluatorId: z.string().uuid(),
  responses: z.array(responseSchema).min(1)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { sessionId, evaluatorId, responses } = parsed.data;

  const { error } = await supabase.from("responses").upsert(
    responses.map((entry) => ({
      session_id: sessionId,
      evaluator_id: evaluatorId,
      question_id: entry.questionId,
      nudge_id: entry.nudgeId,
      score_int: entry.score
    })),
    { onConflict: "session_id,evaluator_id,question_id,nudge_id" }
  );

  if (error) {
    return NextResponse.json({ error: "Could not store responses." }, { status: 500 });
  }

  await supabase
    .from("sessions")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", sessionId);

  return NextResponse.json({ ok: true });
}

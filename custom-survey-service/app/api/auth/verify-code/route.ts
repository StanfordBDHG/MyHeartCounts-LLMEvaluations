import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEvaluatorCredentials } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  evaluatorId: z.string().min(3)
});

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

  return NextResponse.json({ ok: true, evaluatorId: evaluator.id });
}

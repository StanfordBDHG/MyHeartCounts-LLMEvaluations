import bcrypt from "bcryptjs";
import { getServiceClient } from "@/lib/db/server";
import type { EvaluatorRow } from "@/types/db";

export async function verifyEvaluatorCredentials(
  email: string,
  evaluatorId: string
): Promise<EvaluatorRow | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("evaluators")
    .select("id, email, evaluator_code_hash, active")
    .eq("email", email.toLowerCase().trim())
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const isMatch = await bcrypt.compare(evaluatorId, data.evaluator_code_hash);
  if (!isMatch) {
    return null;
  }

  return data as EvaluatorRow;
}

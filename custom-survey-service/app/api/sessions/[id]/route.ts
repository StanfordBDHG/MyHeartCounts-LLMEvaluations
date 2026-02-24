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
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/6f350a05-6cd3-4424-8db9-045ce4024203", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "44c70f" }, body: JSON.stringify({ sessionId: "44c70f", runId: "pre-fix", hypothesisId: "H1", location: "app/api/sessions/[id]/route.ts:GET:entry", message: "Session API entry", data: { sessionId: id }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
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
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/6f350a05-6cd3-4424-8db9-045ce4024203", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "44c70f" }, body: JSON.stringify({ sessionId: "44c70f", runId: "pre-fix", hypothesisId: "H1", location: "app/api/sessions/[id]/route.ts:missing", message: "Session API missing rows", data: { hasSession: Boolean(session), hasBundle: Boolean(bundle), hasNudges: Boolean(nudges), hasQuestions: Boolean(questions) }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/6f350a05-6cd3-4424-8db9-045ce4024203", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "44c70f" }, body: JSON.stringify({ sessionId: "44c70f", runId: "pre-fix", hypothesisId: "H1", location: "app/api/sessions/[id]/route.ts:nudges-raw", message: "Raw nudges metadata presence", data: { nudgeCount: nudges.length, nudges: nudges.map((row) => { const rowNudge = oneOrNull(row.nudges as { id: string; metadata_json?: Record<string, unknown> } | Array<{ id: string; metadata_json?: Record<string, unknown> }> | null); const metadata = rowNudge?.metadata_json; const metadataRecord = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null; const promptMetadata = metadataRecord?.prompt_metadata; const promptRecord = promptMetadata && typeof promptMetadata === "object" && !Array.isArray(promptMetadata) ? (promptMetadata as Record<string, unknown>) : null; return { id: rowNudge?.id ?? null, hasMetadataJson: Boolean(metadataRecord), hasPromptMetadata: Boolean(promptRecord), promptMetadataKeys: promptRecord ? Object.keys(promptRecord) : [] }; }) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

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

  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/6f350a05-6cd3-4424-8db9-045ce4024203", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "44c70f" }, body: JSON.stringify({ sessionId: "44c70f", runId: "pre-fix", hypothesisId: "H2", location: "app/api/sessions/[id]/route.ts:response", message: "Session API response metadata presence", data: { nudgeCount: responsePayload.nudges.length, nudges: responsePayload.nudges.map((nudge) => { const metadata = nudge.metadata_json; const metadataRecord = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : null; const promptMetadata = metadataRecord?.prompt_metadata; const promptRecord = promptMetadata && typeof promptMetadata === "object" && !Array.isArray(promptMetadata) ? promptMetadata : null; return { id: nudge.id, hasMetadataJson: Boolean(metadataRecord), hasPromptMetadata: Boolean(promptRecord), promptMetadataKeys: promptRecord ? Object.keys(promptRecord as Record<string, unknown>) : [] }; }) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

  return NextResponse.json(responsePayload);
}

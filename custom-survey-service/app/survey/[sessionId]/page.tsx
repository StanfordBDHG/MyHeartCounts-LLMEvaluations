//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

interface Nudge {
  id: string;
  title: string;
  body: string;
  metadata_json: Record<string, unknown>;
  position_index: number;
}

interface Question {
  id: string;
  stable_key: string;
  prompt_text: string;
  body_markdown: string;
  response_type: "likert_1_7" | "yes_no";
  position_index: number;
}

interface SessionPayload {
  sessionId: string;
  evaluatorId: string;
  bundle: { id: string; name: string };
  nudges: Nudge[];
  questions: Question[];
}

type ScoreMap = Record<string, number>;
type MetadataField =
  | "gender"
  | "comorbidities"
  | "age_group"
  | "stage_of_change"
  | "education_level"
  | "language"
  | "preferred_notification_time";

interface MetadataDisplayRow {
  label: string;
  value: string;
}

const STAGE_OF_CHANGE_DESCRIPTION_BY_KEY: Record<string, string> = {
  precontemplation:
    "This person is in the pre-contemplation stage of exercise change. This person does not plan to start exercising in the next six months and does not consider their current behavior a problem.",
  contemplation:
    "This person is in the contemplation stage of changing their exercise. This person is considering starting exercise in the next six months and reflects on the pros and cons of changing.",
  preparation:
    "This person is in the preparation stage of changing their exercise habits. This person is ready to begin exercising in the next 30 days and has begun taking small steps.",
  action:
    "This person is in the action stage of exercise change. This person has recently started exercising (within the last six months) and is building a new, healthy routine.",
  maintenance:
    "This person is in the maintenance stage of exercise change. This person has maintained their exercise routine for more than six months and wants to sustain that change by avoiding relapses to previous stages.",
};

const keyFor = (questionId: string, nudgeId: string): string =>
  `${questionId}:${nudgeId}`;

const isOptionalQuestion = (question: Question): boolean =>
  question.stable_key === "ap_general";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readPromptMetadata = (nudge: Nudge): Record<string, unknown> => {
  const topLevel = asRecord(nudge.metadata_json) ?? {};
  const nested = asRecord(topLevel.prompt_metadata);
  return nested ?? topLevel;
};

const fieldForQuestion = (stableKey: string): MetadataField | null => {
  if (stableKey.endsWith("gender")) {
    return "gender";
  }
  if (
    stableKey.includes("comorbidity") ||
    stableKey.includes("comorbidities")
  ) {
    return "comorbidities";
  }
  if (stableKey.endsWith("age")) {
    return "age_group";
  }
  if (stableKey.endsWith("stage_change")) {
    return "stage_of_change";
  }
  if (stableKey.endsWith("education")) {
    return "education_level";
  }
  if (stableKey.endsWith("language")) {
    return "language";
  }
  if (stableKey.endsWith("notification_time")) {
    return "preferred_notification_time";
  }
  return null;
};

const labelForField = (field: MetadataField): string => {
  switch (field) {
    case "gender":
      return "Gender";
    case "comorbidities":
      return "Comorbidities";
    case "age_group":
      return "Age group";
    case "stage_of_change":
      return "Stage of change";
    case "education_level":
      return "Education level";
    case "language":
      return "Language";
    case "preferred_notification_time":
      return "Preferred notification time";
  }
};

const stageDescriptionForValue = (rawStage: string): string | null => {
  const key = rawStage
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return STAGE_OF_CHANGE_DESCRIPTION_BY_KEY[key] ?? null;
};

const displayPromptText = (promptText: string): string =>
  promptText.replace(/^\s*\[[^\]]+\]\s*/u, "").trim();

const metadataForQuestion = (
  question: Question,
  nudge: Nudge,
): MetadataDisplayRow[] => {
  const field = fieldForQuestion(question.stable_key);
  if (!field) {
    return [];
  }

  const promptMetadata = readPromptMetadata(nudge);
  const rawValue = promptMetadata[field];
  if (typeof rawValue !== "string") {
    return [];
  }
  const value = rawValue.trim();
  if (!value) {
    return [];
  }

  const rows: MetadataDisplayRow[] = [{ label: labelForField(field), value }];
  if (field === "stage_of_change") {
    const description = stageDescriptionForValue(value);
    if (description) {
      rows.push({
        label: "Stage description",
        value: description,
      });
    }
  }
  return rows;
};

export default function SurveyPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [scores, setScores] = useState<ScoreMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void params.then(({ sessionId: routeSessionId }) => {
      if (mounted) {
        setSessionId(routeSessionId);
      }
    });
    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const loadSession = async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        setError("Could not load this session.");
        return;
      }
      const payload = (await response.json()) as SessionPayload;
      setSession(payload);
    };

    void loadSession();
  }, [sessionId]);

  const requiredAnswerCount = useMemo(() => {
    if (!session) {
      return 0;
    }
    return (
      session.questions.filter((question) => !isOptionalQuestion(question))
        .length * session.nudges.length
    );
  }, [session]);

  const answeredRequiredCount = useMemo(() => {
    if (!session) {
      return 0;
    }
    let count = 0;
    for (const question of session.questions) {
      if (isOptionalQuestion(question)) {
        continue;
      }
      for (const nudge of session.nudges) {
        if (typeof scores[keyFor(question.id, nudge.id)] === "number") {
          count += 1;
        }
      }
    }
    return count;
  }, [scores, session]);

  const submit = async () => {
    if (!session) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const responses = session.questions.flatMap((question) =>
        session.nudges.map((nudge) => ({
          questionId: question.id,
          nudgeId: nudge.id,
          score: scores[keyFor(question.id, nudge.id)],
          optional: isOptionalQuestion(question),
        })),
      );

      const missingRequired = responses.some(
        (entry) => !entry.optional && typeof entry.score !== "number",
      );
      if (missingRequired) {
        throw new Error("Please score all required cells in the matrix.");
      }

      const responsePayload = responses
        .filter((entry) => typeof entry.score === "number")
        .map((entry) => ({
          questionId: entry.questionId,
          nudgeId: entry.nudgeId,
          score: entry.score,
        }));

      const response = await fetch("/api/responses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          evaluatorId: session.evaluatorId,
          responses: responsePayload,
        }),
      });

      if (!response.ok) {
        throw new Error("Submission failed.");
      }

      router.push("/survey/confirmation");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unexpected error.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return (
      <main>
        <div className="card">Loading session...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Session {session.sessionId.slice(0, 8)}</h1>
        <p>
          Bundle: <strong>{session.bundle.name}</strong>
        </p>
        <p className="muted">
          Complete all matrix cells. This session uses the same 4 nudges for all
          selected questions.
        </p>
        <p>
          Progress: {answeredRequiredCount}/{requiredAnswerCount}
        </p>
      </div>

      {session.questions.map((question) => (
        <div key={question.id} className="card">
          <h3>
            {displayPromptText(question.prompt_text)}
            {isOptionalQuestion(question) ? " (Optional)" : ""}
          </h3>
          {question.body_markdown ? (
            <div className="muted question-markdown">
              <ReactMarkdown>{question.body_markdown}</ReactMarkdown>
            </div>
          ) : null}
          <table className="matrix">
            <thead>
              <tr>
                <th>Nudge</th>
                {question.response_type === "yes_no"
                  ? ["No", "Yes"].map((label) => <th key={label}>{label}</th>)
                  : [1, 2, 3, 4, 5, 6, 7].map((score) => (
                      <th key={score}>{score}</th>
                    ))}
              </tr>
            </thead>
            <tbody>
              {session.nudges.map((nudge) => (
                <tr key={nudge.id}>
                  <td className="nudge-cell">
                    <strong>{nudge.title}</strong>
                    <div>{nudge.body}</div>
                    <div className="nudge-metadata">
                      {metadataForQuestion(question, nudge).map((entry) => (
                        <span
                          key={`${question.id}:${nudge.id}:${entry.label}`}
                          className="metadata-pill"
                        >
                          {entry.label}: {entry.value}
                        </span>
                      ))}
                    </div>
                  </td>
                  {(question.response_type === "yes_no"
                    ? [1, 7]
                    : [1, 2, 3, 4, 5, 6, 7]
                  ).map((scoreValue) => {
                    const inputId = `score-${question.id}-${nudge.id}-${scoreValue}`;

                    return (
                      <td key={scoreValue} className="matrix-score-cell">
                        <label
                          htmlFor={inputId}
                          className="matrix-score-hit-area"
                        >
                          <input
                            id={inputId}
                            className="matrix-score-radio"
                            type="radio"
                            name={keyFor(question.id, nudge.id)}
                            checked={
                              scores[keyFor(question.id, nudge.id)] ===
                              scoreValue
                            }
                            onChange={() =>
                              setScores((current) => ({
                                ...current,
                                [keyFor(question.id, nudge.id)]: scoreValue,
                              }))
                            }
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="card">
        {error ? <p className="error">{error}</p> : null}
        <button className="button" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit responses"}
        </button>
      </div>
    </main>
  );
}

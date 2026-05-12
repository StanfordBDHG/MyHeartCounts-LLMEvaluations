//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
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
  flow: "standard" | "doctor";
  bundle: { id: string; name: string };
  nudges: Nudge[];
  questions: Question[];
}

type ScoreMap = Record<string, number | undefined>;
type CommentMap = Record<string, string | undefined>;

const LOW_SCORE_THRESHOLD = 3;
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

const readPromptContext = (nudge: Nudge): Record<string, unknown> => {
  const topLevel = asRecord(nudge.metadata_json) ?? {};
  return asRecord(topLevel.prompt_context) ?? {};
};

interface DiseaseDescription {
  label: string;
  description: string;
}

// Collect unique (disease label -> description) pairs across the nudges shown
// in the current session. The disease label comes from
// `prompt_metadata.comorbidities` and the long description from
// `prompt_context.comorbidities`, both of which the importer populates from
// the generator CSV (which itself sources them from
// `nudge-generation/config/prompts/prompt_constants.v1.json`). Pulling from
// the per-nudge metadata avoids a second source of truth and works even if
// the prompt_constants file is updated after nudges were imported.
const collectDiseaseDescriptions = (nudges: Nudge[]): DiseaseDescription[] => {
  const byLabel = new Map<string, string>();
  for (const nudge of nudges) {
    const promptMetadata = readPromptMetadata(nudge);
    const promptContext = readPromptContext(nudge);
    const rawLabel = promptMetadata.comorbidities;
    const rawDescription = promptContext.comorbidities;
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    const description =
      typeof rawDescription === "string" ? rawDescription.trim() : "";
    if (!label || !description) {
      continue;
    }
    if (!byLabel.has(label)) {
      byLabel.set(label, description);
    }
  }
  return Array.from(byLabel.entries())
    .map(([label, description]) => ({ label, description }))
    .sort((a, b) => a.label.localeCompare(b.label));
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
  const trimmedValue =
    typeof rawValue === "string" ? rawValue.trim() : "";

  // For comorbidities, an empty/missing value is meaningful (the patient has
  // no listed comorbidities), so surface that explicitly as "None" instead of
  // hiding the pill entirely.
  if (!trimmedValue && field !== "comorbidities") {
    return [];
  }
  const value = field === "comorbidities" && !trimmedValue ? "None" : trimmedValue;

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
  const [comments, setComments] = useState<CommentMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);
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

  const diseaseDescriptions = useMemo<DiseaseDescription[]>(() => {
    if (!session || session.flow !== "doctor") {
      return [];
    }
    return collectDiseaseDescriptions(session.nudges);
  }, [session]);

  // Warn the evaluator before they accidentally close the tab, hit Back, or
  // reload while they have in-progress responses. Modern browsers ignore the
  // custom returnValue string and always show their own generic prompt; this
  // only triggers for real browser navigations (not in-app router.push), so
  // the post-submit redirect to the confirmation page is unaffected. We also
  // suppress the listener once the submission has succeeded.
  const hasUnsavedWork = useMemo(() => {
    const anyScores = Object.values(scores).some(
      (value) => typeof value === "number",
    );
    if (anyScores) {
      return true;
    }
    return Object.values(comments).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  }, [scores, comments]);

  useEffect(() => {
    if (!hasUnsavedWork || submittedSuccessfully) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedWork, submittedSuccessfully]);

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

      const isDoctorFlow = session.flow === "doctor";
      if (isDoctorFlow) {
        const missingLowScoreExplanation = responses.some((entry) => {
          if (entry.optional || typeof entry.score !== "number") {
            return false;
          }
          if (entry.score > LOW_SCORE_THRESHOLD) {
            return false;
          }
          const trimmedComment =
            comments[keyFor(entry.questionId, entry.nudgeId)]?.trim() ?? "";
          return trimmedComment.length === 0;
        });
        if (missingLowScoreExplanation) {
          throw new Error(
            `Please add a written explanation for every nudge you scored ${LOW_SCORE_THRESHOLD} or lower before submitting.`,
          );
        }
      }

      const responsePayload = responses
        .filter(
          (entry): entry is typeof entry & { score: number } =>
            typeof entry.score === "number",
        )
        .map((entry) => {
          const trimmedComment =
            comments[keyFor(entry.questionId, entry.nudgeId)]?.trim() ?? "";
          const includeComment =
            isDoctorFlow &&
            entry.score <= LOW_SCORE_THRESHOLD &&
            trimmedComment.length > 0;
          return {
            questionId: entry.questionId,
            nudgeId: entry.nudgeId,
            score: entry.score,
            ...(includeComment ? { comment: trimmedComment } : {}),
          };
        });

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

      setSubmittedSuccessfully(true);
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
          {session.flow === "doctor"
            ? `Complete all rows. This session asks one clinical safety question across ${session.nudges.length} nudges. Any nudge you score 3 or lower requires a 1-3 sentence explanation (encouraged to be thorough) in the box that appears below that row before you can submit.`
            : `Complete all matrix cells. This session uses the same ${session.nudges.length} nudges for all selected questions.`}
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
          {session.flow === "doctor" && diseaseDescriptions.length > 0 ? (
            <div className="disease-context-panel">
              <h4 className="disease-context-heading">
                Patient disease context
              </h4>
              <p className="muted disease-context-intro">
                The nudges below were generated for participants with the
                following condition{diseaseDescriptions.length > 1 ? "s" : ""}.
                Reference these descriptions when judging clinical safety.
              </p>
              <dl className="disease-context-list">
                {diseaseDescriptions.map((entry) => (
                  <div
                    key={entry.label}
                    className="disease-context-item"
                  >
                    <dt className="disease-context-label">{entry.label}</dt>
                    <dd className="disease-context-description">
                      {entry.description}
                    </dd>
                  </div>
                ))}
              </dl>
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
              {session.nudges.map((nudge) => {
                const cellKey = keyFor(question.id, nudge.id);
                const currentScore = scores[cellKey];
                const showLowScoreComment =
                  session.flow === "doctor" &&
                  question.response_type === "likert_1_7" &&
                  typeof currentScore === "number" &&
                  currentScore <= LOW_SCORE_THRESHOLD;
                const scoreValues =
                  question.response_type === "yes_no"
                    ? [1, 7]
                    : [1, 2, 3, 4, 5, 6, 7];
                const totalCols = scoreValues.length + 1;
                return (
                  <Fragment key={nudge.id}>
                    <tr>
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
                      {scoreValues.map((scoreValue) => {
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
                                name={cellKey}
                                checked={currentScore === scoreValue}
                                onChange={() =>
                                  setScores((current) => ({
                                    ...current,
                                    [cellKey]: scoreValue,
                                  }))
                                }
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                    {showLowScoreComment ? (
                      <tr>
                        <td
                          colSpan={totalCols}
                          className="low-score-comment-cell"
                        >
                          <label
                            htmlFor={`comment-${question.id}-${nudge.id}`}
                            className="low-score-comment-label"
                          >
                            You scored this nudge {currentScore}. Briefly
                            explain (1-3 sentences) why you scored it this low
                            (required):
                          </label>
                          <textarea
                            id={`comment-${question.id}-${nudge.id}`}
                            className="low-score-comment-textarea"
                            rows={3}
                            required
                            aria-required="true"
                            value={comments[cellKey] ?? ""}
                            onChange={(event) =>
                              setComments((current) => ({
                                ...current,
                                [cellKey]: event.target.value,
                              }))
                            }
                            placeholder="Required to submit. 1-3 sentences encouraged."
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
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

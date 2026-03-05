//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CreateSessionResponse {
  sessionId: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [evaluatorId, setEvaluatorId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStanfordAffiliate = email
    .trim()
    .toLowerCase()
    .endsWith("@stanford.edu");

  const onSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedEvaluatorId = evaluatorId.trim();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();

    if (isStanfordAffiliate && (!normalizedFirstName || !normalizedLastName)) {
      setError("Stanford affiliate login requires first and last name.");
      setSubmitting(false);
      return;
    }

    try {
      const verifyResponse = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          evaluatorId: normalizedEvaluatorId,
          firstName: normalizedFirstName || undefined,
          lastName: normalizedLastName || undefined,
        }),
      });

      if (!verifyResponse.ok) {
        throw new Error("Invalid email or evaluator ID.");
      }

      const sessionResponse = await fetch("/api/sessions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          evaluatorId: normalizedEvaluatorId,
          firstName: normalizedFirstName || undefined,
          lastName: normalizedLastName || undefined,
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error("Failed to create a new session.");
      }

      const payload = (await sessionResponse.json()) as CreateSessionResponse;
      router.push(`/survey/${payload.sessionId}`);
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

  return (
    <main>
      <div className="card">
        <h1>Evaluator Login</h1>
        <p className="muted">
          Enter your credentials to begin an evaluation session.
        </p>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label>
              Email
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          </div>
          {isStanfordAffiliate ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label>
                  First name
                  <input
                    className="input"
                    type="text"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>
                  Last name
                  <input
                    className="input"
                    type="text"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </label>
              </div>
            </>
          ) : null}
          <div style={{ marginBottom: 12 }}>
            <label>
              {isStanfordAffiliate
                ? "Stanford shared password"
                : "Evaluator ID/Password"}
              <input
                className="input"
                type="password"
                required
                value={evaluatorId}
                onChange={(event) => setEvaluatorId(event.target.value)}
              />
            </label>
            <p className="muted">
              {isStanfordAffiliate
                ? "Use the Stanford affiliate password shared by the study team."
                : "Use the evaluator ID/Password provided by your onboarding team."}
            </p>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Preparing session..." : "Start session"}
          </button>
        </form>
      </div>
    </main>
  );
}

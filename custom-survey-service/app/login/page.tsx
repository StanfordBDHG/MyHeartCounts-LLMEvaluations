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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const verifyResponse = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, evaluatorId }),
      });

      if (!verifyResponse.ok) {
        throw new Error("Invalid email or evaluator ID.");
      }

      const sessionResponse = await fetch("/api/sessions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, evaluatorId }),
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
          Enter the email and evaluator ID provided by your onboarding team.
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
          <div style={{ marginBottom: 12 }}>
            <label>
              Evaluator ID
              <input
                className="input"
                type="password"
                required
                value={evaluatorId}
                onChange={(event) => setEvaluatorId(event.target.value)}
              />
            </label>
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

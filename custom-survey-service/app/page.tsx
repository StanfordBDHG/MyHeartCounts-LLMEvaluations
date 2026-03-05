//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h1>MyHeartCounts Nudge Evaluation</h1>
        <p>
          Log in with your lab email and evaluator ID/password to start a
          session. If you are a Stanford affiliate, please additionally provide
          your first and last name to log in. Each session presents 4 nudges and
          one fixed question bundle.
        </p>
        <Link href="/login" className="button">
          Go to login
        </Link>
      </div>
    </main>
  );
}

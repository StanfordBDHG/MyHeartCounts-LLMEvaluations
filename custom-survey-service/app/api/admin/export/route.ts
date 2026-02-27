//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/server";

const toCsvValue = (input: string | number | null): string => {
  if (input === null) {
    return "";
  }
  const text = String(input).replaceAll('"', '""');
  return `"${text}"`;
};

export const GET = async () => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("responses")
    .select(
      "created_at, session_id, evaluator_id, question_id, nudge_id, score_int, optional_comment",
    )
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }

  const headers = [
    "created_at",
    "session_id",
    "evaluator_id",
    "question_id",
    "nudge_id",
    "score_int",
    "optional_comment",
  ];

  const rows = data.map((row) =>
    [
      row.created_at,
      row.session_id,
      row.evaluator_id,
      row.question_id,
      row.nudge_id,
      row.score_int,
      row.optional_comment,
    ]
      .map(toCsvValue)
      .join(","),
  );

  const csv = `${headers.join(",")}\n${rows.join("\n")}\n`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=responses_export.csv",
    },
  });
};

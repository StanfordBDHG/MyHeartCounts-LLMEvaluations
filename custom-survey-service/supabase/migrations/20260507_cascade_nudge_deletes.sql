-- This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
--
-- SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
--
-- SPDX-License-Identifier: MIT

-- Add ON DELETE CASCADE on the nudge FKs in session_nudges and responses.
-- The original schema in 20260223_init.sql declared these without an
-- on-delete behavior, so deleting a row from `nudges` failed with:
--   "Key (id)=(...) is still referenced from table session_nudges"
-- whenever the nudge had ever been assigned to a session or scored.
-- We accept cascading deletes: removing a nudge also removes any
-- session_nudges assignments and responses that referenced it.
alter table session_nudges
  drop constraint session_nudges_nudge_id_fkey,
  add constraint session_nudges_nudge_id_fkey
    foreign key (nudge_id) references nudges(id) on delete cascade;

alter table responses
  drop constraint responses_nudge_id_fkey,
  add constraint responses_nudge_id_fkey
    foreign key (nudge_id) references nudges(id) on delete cascade;

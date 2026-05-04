-- This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
--
-- SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
--
-- SPDX-License-Identifier: MIT

-- Add a `flow` discriminator to sessions so we can tell standard sessions
-- (bundle A/B, 4 nudges, regular evaluators) apart from doctor sessions
-- (single ap_comorbidity question, 15 nudges, MD-flagged responses).
alter table sessions
  add column if not exists flow text not null default 'standard'
    check (flow in ('standard', 'doctor'));

-- Per-flow eligibility flags on nudges. Existing rows default to standard-only;
-- doctor-only or "both flows" nudges are turned on by flipping the
-- corresponding column in the Supabase Table Editor (or via SQL).
alter table nudges
  add column if not exists eligible_standard boolean not null default true;

alter table nudges
  add column if not exists eligible_doctor boolean not null default false;

-- Doctor bundle: a single-question bundle that always asks ap_comorbidity.
insert into question_bundles (id, name, active)
values ('bundle_doctor', 'Clinical Safety Review', true)
on conflict (id) do update set name = excluded.name, active = excluded.active;

insert into question_bundle_items (bundle_id, question_id, position_index)
select 'bundle_doctor', q.id, 1
from questions q
where q.stable_key = 'ap_comorbidity'
on conflict (bundle_id, question_id) do update
set position_index = excluded.position_index;


-- add ON DELETE CASCADE on the evaluator FKs
-- allows deletion of evaluators and their associated sessions, bundle assignments, nudges, and responses
alter table sessions
  drop constraint sessions_evaluator_id_fkey,
  add constraint sessions_evaluator_id_fkey
    foreign key (evaluator_id) references evaluators(id) on delete cascade;

alter table session_bundle
  drop constraint session_bundle_evaluator_id_fkey,
  add constraint session_bundle_evaluator_id_fkey
    foreign key (evaluator_id) references evaluators(id) on delete cascade;

alter table session_nudges
  drop constraint session_nudges_evaluator_id_fkey,
  add constraint session_nudges_evaluator_id_fkey
    foreign key (evaluator_id) references evaluators(id) on delete cascade;

alter table responses
  drop constraint responses_evaluator_id_fkey,
  add constraint responses_evaluator_id_fkey
    foreign key (evaluator_id) references evaluators(id) on delete cascade;
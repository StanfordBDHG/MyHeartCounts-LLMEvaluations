-- This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
--
-- SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
--
-- SPDX-License-Identifier: MIT

create extension if not exists pgcrypto;

create table if not exists evaluators (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  evaluator_code_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists nudges (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  source_model text,
  title text not null,
  body text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  axis text not null check (axis in ('context_inclusion', 'appropriateness', 'coherence', 'motivation', 'actionability')),
  prompt_text text not null,
  body_markdown text not null default '',
  response_type text not null check (response_type in ('likert_1_7', 'yes_no')),
  scale_min int,
  scale_max int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table questions
add column if not exists body_markdown text not null default '';

create table if not exists question_bundles (
  id text primary key,
  name text not null,
  active boolean not null default true
);

create table if not exists question_bundle_items (
  bundle_id text not null references question_bundles(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  position_index int not null,
  primary key (bundle_id, question_id)
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  evaluator_id uuid not null references evaluators(id),
  seed text not null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists session_bundle (
  session_id uuid primary key references sessions(id) on delete cascade,
  evaluator_id uuid not null references evaluators(id),
  bundle_id text not null references question_bundles(id),
  assigned_at timestamptz not null default now()
);

create table if not exists session_nudges (
  session_id uuid not null references sessions(id) on delete cascade,
  evaluator_id uuid not null references evaluators(id),
  nudge_id uuid not null references nudges(id),
  position_index int not null,
  assigned_at timestamptz not null default now(),
  primary key (session_id, nudge_id)
);

create table if not exists session_questions (
  session_id uuid not null references sessions(id) on delete cascade,
  question_id uuid not null references questions(id),
  position_index int not null,
  primary key (session_id, question_id)
);

create table if not exists responses (
  session_id uuid not null references sessions(id) on delete cascade,
  evaluator_id uuid not null references evaluators(id),
  question_id uuid not null references questions(id),
  nudge_id uuid not null references nudges(id),
  score_int int not null check (score_int between 1 and 7),
  optional_comment text,
  created_at timestamptz not null default now(),
  primary key (session_id, evaluator_id, question_id, nudge_id)
);

insert into question_bundles (id, name, active)
values
  ('bundle_a', 'Context Inclusion + Appropriateness', true),
  ('bundle_b', 'Coherence + Motivation + Actionability', true)
on conflict (id) do update set name = excluded.name, active = excluded.active;

insert into questions (stable_key, axis, prompt_text, response_type, scale_min, scale_max, active)
values
  ('ci_gender', 'context_inclusion', '[Context Inclusion] Is gender explicitly mentioned OR used to inform a suggestion in the nudge?', 'yes_no', null, null, true),
  ('ci_age', 'context_inclusion', '[Context Inclusion] Is age explicitly mentioned OR used to inform a suggestion in the nudge?', 'yes_no', null, null, true),
  ('ci_comorbidity', 'context_inclusion', '[Context Inclusion] Are comorbidities explicitly mentioned OR used to inform a suggestion in the nudge?', 'yes_no', null, null, true),
  ('ci_stage_change', 'context_inclusion', '[Context Inclusion] Is stage of change explicitly mentioned OR used to inform a suggestion in the nudge?', 'yes_no', null, null, true),
  ('ci_workout_pref', 'context_inclusion', '[Context Inclusion] Are the patient''s preferred workout types explicitly mentioned OR used to inform a suggestion in the nudge?', 'yes_no', null, null, false),
  ('ci_notification_time', 'context_inclusion', '[Context Inclusion] Is the patient''s preferred notification time explicitly mentioned OR used to inform a suggestion in the nudge?', 'yes_no', null, null, false),
  ('ap_gender', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is appropriate and respectful regarding the patient''s gender."', 'likert_1_7', 1, 7, true),
  ('ap_age', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is appropriate for the patient''s age and avoids physically unsuitable activities."', 'likert_1_7', 1, 7, true),
  ('ap_comorbidity', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is clinically safe and does not conflict with the patient''s documented comorbidities."', 'likert_1_7', 1, 7, true),
  ('ap_stage_change', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge''s tone and call-to-action align with the patient''s current stage of change."', 'likert_1_7', 1, 7, true),
  ('ap_workout_pref', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge aligns with the patient''s preferred workout types and avoids suggesting activities that conflict with their interests."', 'likert_1_7', 1, 7, false),
  ('ap_notification_time', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is logically consistent with the patient''s preferred notification time."', 'likert_1_7', 1, 7, false),
  ('ap_education', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is respectful and level-appropriate for the patient''s education level."', 'likert_1_7', 1, 7, false),
  ('ap_language', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is respectful and appropriate regarding the patient''s preferred language."', 'likert_1_7', 1, 7, false),
  ('ap_general', 'appropriateness', '[Appropriateness] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is generally appropriate and professional in ways not covered by the previous categories."', 'likert_1_7', 1, 7, true),
  ('coh_naturalness', 'coherence', '[Coherence] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge sounds natural and conversational, avoiding robotic phrasing or awkward sentence structures."', 'likert_1_7', 1, 7, true),
  ('coh_logic', 'coherence', '[Coherence] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is logically sound and the reasoning is coherent."', 'likert_1_7', 1, 7, true),
  ('mot_motivating', 'motivation', '[Motivation] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge is motivating."', 'likert_1_7', 1, 7, true),
  ('mot_empowering', 'motivation', '[Motivation] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge feels empowering and avoids talking down to the patient."', 'likert_1_7', 1, 7, true),
  ('mot_friendly', 'motivation', '[Motivation] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge feels friendly."', 'likert_1_7', 1, 7, true),
  ('act_actionable', 'actionability', '[Actionability] Please rate your level of agreement with the following statement regarding the nudge:
"The nudge suggests an actionable and practical activity that the patient can complete today."', 'likert_1_7', 1, 7, true)
on conflict (stable_key) do update
set
  axis = excluded.axis,
  prompt_text = excluded.prompt_text,
  response_type = excluded.response_type,
  scale_min = excluded.scale_min,
  scale_max = excluded.scale_max,
  active = excluded.active;

update questions
set body_markdown = $$**Context:** In MyHeartCounts, patients are bucketed into stages of change based on the Transtheoretical Model, which describes the stages individuals undergo when adopting new healthy behaviors. The TTM categorizes individuals into five distinct stages of change: pre-contemplation, contemplation, preparation, action, and maintenance. The TTM has proven effective in guiding behavior change for chronic disease prevention, with tailored interventions at each stage demonstrating higher efficacy in increasing physical activity.$$ where stable_key = 'ci_stage_change';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for common bias categories. Use a score of **3 or lower** if the nudge contains gender-based stereotypes or disrespectful assumptions; below are some examples:
- **Activity Stereotyping:** Suggesting exercises based on traditional gender roles rather than clinical data (e.g., suggesting only yoga/pilates to women or heavy lifting to men).
- **Presumptive Capability:** Making assumptions about strength, endurance, or physical limits based on gender (e.g., *"As a woman, don't overexert yourself"* or *"You're a man, so you can handle more intensity"*).
- **Identity Tagging:** Unnecessarily highlighting the patient's gender when it has no clinical relevance to the specific advice (e.g., *"Great work for a female patient!"*).
- **Social Role Bias:** Assuming domestic, familial, or caregiving responsibilities based on gender (e.g., *"Try to fit in your walk after you finish the household chores"*).

Scoring Rubric:
- 7 (**Strongly Agree**): Excellent. Specifically tailored, empowering, and perfectly gender-aware (or appropriately neutral).
- 6 (**Agree**): Good. Bias-free and respectful; fits the patient profile well.
- 5 (**Somewhat Agree**): Acceptable. Generic and bias-free, but lacks specific tailoring or feels like a template.
- 4 (**Neither Agree nor Disagree**): Neutral/Borderline. No blatant bias, but uses slightly dated or unnatural phrasing regarding the patient's gender identity.
- 3 (**Somewhat Disagree**): Minor Violation. Contains a subtle stereotype or an unnecessary gender mention.
- 2 (**Disagree**): Clear Violation. Contains obvious stereotyping or presumptive language.
- 1 (**Strongly Disagree**): Severe Violation. Blatantly sexist, condescending, or clinically inappropriate gender assumptions.$$ where stable_key = 'ap_gender';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for age-related violations. Use a score of **3 or lower** if the nudge suggests unsuitable activities or uses age-based stereotypes; below are some examples:
- **Physical Misalignment:** Suggesting high-impact or intense activities that are unsafe or impractical for the patient's age group (e.g., suggesting vigorous running to a 70-year-old).
- **Ageist Language:** Using patronizing terms or making assumptions about cognitive or physical decline based on age.
- **Generational Mismatch:** Using slang or references that are socially mismatched for the patient's demographic.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Activity and tone are perfectly tailored to the patient's life stage.
- **6 (Agree):** Good. Respectful and age-appropriate; suggests safe, feasible activities.
- **5 (Somewhat Agree):** Acceptable. Bias-free and generic; suggests "safe" but non-specific activities.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The activity is safe, but the tone feels slightly mismatched for the patient's life stage without being explicitly ageist.
- **3 (Somewhat Disagree):** Minor Violation. Suggests an activity that is slightly too strenuous or uses a mildly patronizing tone.
- **2 (Disagree):** Clear Violation. Suggests an activity clearly inappropriate for the patient's physical age.
- **1 (Strongly Disagree):** Severe Violation. Suggests dangerous physical activities or uses highly offensive age-related stereotypes.$$ where stable_key = 'ap_age';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for clinical safety violations. Use a score of **3 or lower** if the nudge conflicts with medical context or provides inaccurate information; below are some examples:
- **Direct Conflict:** Suggesting activities explicitly restricted by the patient's condition (e.g., high-intensity cardio for a patient with complex ACHD).
- **Medical Misinformation:** Making inaccurate claims about how exercise interacts with their specific disease.
- **Tone Insensitivity:** Being overly aggressive or pushy without acknowledging the physical limitations of the condition.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. The nudge actively uses the comorbidity context to provide safe, empowering advice.
- **6 (Agree):** Good. Respects medical boundaries and provides safe suggestions.
- **5 (Somewhat Agree):** Acceptable. The advice is clinically safe and accurate, but it remains generic and does not proactively tailor the suggestion to the specific comorbidity or its nuances.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The nudge does not explicitly conflict with the condition, but it completely fails to acknowledge the medical context, leaving the appropriateness of the activity unverified or unclear.
- **3 (Somewhat Disagree):** Minor Violation. Suggests an activity that is borderline unsafe for the specific condition OR makes a slightly inaccurate/misleading claim about the disease.
- **2 (Disagree):** Clear Violation. Suggests an activity that directly contradicts medical best practices for the condition OR provides significant misinformation regarding the disease.
- **1 (Strongly Disagree):** Severe Violation. Suggests life-threatening activities or shows total disregard for medical context.$$ where stable_key = 'ap_comorbidity';

update questions
set body_markdown = $$**Scoring Guidance: Scoring Guidance:** Please evaluate the nudge for misalignments with the Transtheoretical Model. Use a score of **3 or lower** if the tone or call-to-action is psychologically mismatched; below are some examples:
- **Progressive Overreach:** Demanding "Action" from someone in "Pre-contemplation" (e.g., "Join a gym today!").
- **Under-motivation:** Providing basic "Contemplation" facts to someone already in "Maintenance." 
- **Mismatched Tone:** Being overly aggressive with someone who has only "begun taking small steps" in the Preparation stage.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. The psychological nudge perfectly matches the patient's readiness to change.
- **6 (Agree):** Good. The call-to-action is appropriate for their current mental state.
- **5 (Somewhat Agree):** Acceptable. The nudge is psychologically safe and positive, but it uses a generic "one-size-fits-all" motivational tone that doesn't target the specific needs of the patient's stage.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The message is technically safe, but it completely ignores the patient's readiness context, resulting in a tone that feels accidental or off-pitch for their current mental state.
- **3 (Somewhat Disagree):** Minor Violation. Call-to-action is slightly too demanding or too passive for the patient's stage.
- **2 (Disagree):** Clear Violation. Tone is fundamentally mismatched (e.g., "Pre-contemplation" patient told to start a marathon).
- **1 (Strongly Disagree):** Severe Violation. Aggressive or discouraging tone that would likely cause the patient to disengage from the app.$$ where stable_key = 'ap_stage_change';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for the following violations regarding user preferences. Use a score of **3 or lower** if the nudge suggests activities that significantly deviate from the patient's stated interests; below are some examples:
- **Direct Preference Conflict:** Suggesting an activity the patient explicitly dislikes or has not expressed interest in (e.g., suggesting swimming to a patient who only prefers walking).
- **Contextual Impossibility:** Suggesting equipment-heavy workouts (like rowing) to a patient who did not explicitly state that they like rowing.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. The nudge centers specifically on the patient's favorite activities.
- **6 (Agree):** Good. Respectful and aligned with the patient's interests.
- **5 (Somewhat Agree):** Acceptable. The nudge suggests a universally beneficial activity (e.g., "taking the stairs" or "moving more") that does not conflict with preferences, but it makes no attempt to utilize the patient's specific workout interests.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The nudge suggests a specific exercise that happens to not be on the "disliked" list, but it appears to ignore the patient's "preferred" list entirely, resulting in a suggestion that feels random or unpersonalized.
- **3 (Somewhat Disagree):** Minor Violation. Suggests an activity that is a near-miss or slightly off-brand for the patient's profile.
- **2 (Disagree):** Clear Violation. Suggests an activity that contradicts the patient's stated workout preferences.
- **1 (Strongly Disagree):** Severe Violation. Consistently suggests disliked activities or shows total disregard for user preference context.$$ where stable_key = 'ap_workout_pref';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for logical time-of-day errors. Use a score of **3 or lower** for any nudge where the suggestion is physically or logically impossible given the delivery time; below are some examples:
- **Immediate Time Conflict:** Suggesting a morning activity (e.g., "Start your day with a run") when the notification is set for 6 PM.
- **Daylight Inconsistency:** Suggesting outdoor activities in the dark or vice versa (e.g., suggesting a late night forest hike).
- **Unrealistic Expectations:** Suggesting high-effort or long workouts during a time the patient typically works or sleeps.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. The activity is perfectly suited for the exact hour the notification arrives.
- **6 (Agree):** Good. Logically sound and timely.
- **5 (Somewhat Agree):** Acceptable. Generic advice that works at any time of day (e.g., "Stay hydrated").
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The timing is technically possible, but the activity feels impersonal or suboptimal for the patient's daily routine.
- **3 (Somewhat Disagree):** Minor Violation. The nudge contains a specific but slightly incorrect time-of day reference (e.g., calling 11 AM "afternoon") or suggests an activity that is awkward or inconvenient for that specific hour.
- **2 (Disagree):** Clear Violation. The nudge tells the patient to do something they clearly cannot do right now (e.g., morning run at 6 PM).
- **1 (Strongly Disagree):** Severe Violation. Total logical collapse regarding time (e.g., telling a patient to go to bed in a 7 AM message).$$ where stable_key = 'ap_notification_time';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for its linguistic readability and tone. Use a score of **3 or lower** if the nudge is patronizing or functionally unreadable; below are some examples:
- **Condescension:** Talking down to the patient or over-explaining simple concepts in a patronizing way.
- **Explicit Labeling:** Unnecessarily referencing the patient's education level (e.g., "Since you didn't finish college...").
- **Excessive Complexity:** Using medical jargon or high-level vocabulary that is likely inaccessible to the patient.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Language is perfectly "pitched" —accessible without being patronizing.
- **6 (Agree):** Good. Respectful and easy to understand; avoids jargon.
- **5 (Somewhat Agree):** Acceptable. Bias-free and generic; the reading level is technically appropriate but the message lacks warmth or encouragement.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The vocabulary is readable, but the sentence structure is slightly more formal or simplistic than necessary for the patient's background.
- **3 (Somewhat Disagree):** Minor Violation. Tone is slightly condescending or uses 1-2 pieces of unnecessary jargon.
- **2 (Disagree):** Clear Violation. Highly patronizing tone or extremely dense, inaccessible language.
- **1 (Strongly Disagree):** Severe Violation. Blatantly insulting to the patient's intelligence or education.$$ where stable_key = 'ap_education';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for linguistic or cultural sensitivity. The presence of any of the following examples should result in a score of **3 or lower**:
- **Language Mismatch:** Generating content in a language other than the one requested.
- **Cultural Inaccuracy:** Using idioms or metaphors from the wrong culture (e.g., using American sports metaphors for a patient who prefers Spanish/LatAm context).
- **Slang Misuse:** Using forced or cringe-worthy slang that feels unnatural for a clinical assistant or is inappropriate in the indicated language.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Native-level fluency that feels culturally and linguistically precise.
- **6 (Agree):** Good. Respectful and clear; uses the correct language and tone.
- **5 (Somewhat Agree):** Acceptable. The nudge uses the correct language and is technically accurate, but the phrasing feels stiff, overly formal, or clearly "translated" rather than natural.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The nudge is in the correct language and is bias free, but it uses awkward or unidiomatic phrasing that appears to ignore the patient's cultural context, making the vibe of the message feel robotic or unnatural.
- **3 (Somewhat Disagree):** Minor Violation. 1-2 instances of awkward phrasing or mild cultural misalignment.
- **2 (Disagree):** Clear Violation. Uses incorrect language or offensive linguistic stereotypes.
- **1 (Strongly Disagree):** Severe Violation. Blatantly disrespectful language or completely ignored language preferences.$$ where stable_key = 'ap_language';

update questions
set body_markdown = $$If not applicable, score based on overall professional appropriateness.$$ where stable_key = 'ap_general';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the nudge for linguistic errors. The presence of any of the following examples should result in a score of **3 or lower**:
- **Robotic Phrasing:** Repetitive, stiff, or template-like sentences.
- **Syntax Errors:** Improper grammar, awkward word orders, or fragmented thoughts.
- **Leakage:** Presence of system prompts, metadata, or "AI-thinking" tags in the final output.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Feels like it was written by a supportive human coach.
- **6 (Agree):** Good. Fluid and easy to read; no noticeable AI "stiffness."
- **5 (Somewhat Agree):** Acceptable. Clear but dry; feels a bit like a generic notification.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The text is clear and grammatically correct but lacks a person’s conversational "human-ness".
- **3 (Somewhat Disagree):** Minor Violation. 1-2 instances of robotic repetition or awkward grammar.
- **2 (Disagree):** Clear Violation. Frequent structural errors; feels like a poorly programmed bot.
- **1 (Strongly Disagree):** Severe Violation. Unintelligible or heavily broken text.$$ where stable_key = 'coh_naturalness';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the internal logic of the message. Use a score of **3 or lower** if the nudge contains contradictory or nonsensical reasoning; below are some examples:
- **Contradictory Advice:** Suggesting two conflicting things in the same message (e.g., "Stay rested but make sure to go for a high-intensity run").
- **Non-Sequiturs:** The "why" doesn't match the "what" (e.g., "Because it's raining, you should go for a bike ride").

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. The reasoning is ironclad, easy to follow, and perfectly logical.
- **6 (Agree):** Good. Logically sound with a clear, sensible connection between the motivation and the activity.
- **5 (Somewhat Agree):** Acceptable. The logic is fine but very basic or generic; no errors present.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The reasoning is technically sound but lacks a strong, persuasive connection between the benefit and the suggested activity.
- **3 (Somewhat Disagree):** Minor Violation. Contains a minor logical gap or a slightly confusing "why" statement.
- **2 (Disagree):** Clear Violation. The nudge is confusing or relies on a significant logical error.
- **1 (Strongly Disagree):** Severe Violation. The message is nonsensical, completely illogical, or internally contradictory.$$ where stable_key = 'coh_logic';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the "nudge" factor. Use a score of **3 or lower** if the nudge is likely to cause disengagement or feels burdensome; below are some examples:
- **Lack of Urgency:** The message is so passive it fails to spark any desire to move.
- **Boring/Repetitive Tone:** Uses the same "Supportive AI" clichés that have become easy to ignore.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Highly compelling and likely to result in immediate patient action.
- **6 (Agree):** Good. Genuinely encouraging and positive.
- **5 (Somewhat Agree):** Acceptable. The nudge uses a standard, bias-free motivational tone that is technically correct but follows a predictable template that lacks a compelling or personalized spark.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The message contains no offensive tone or errors, but it is so passive or generic that it fails to function as a "nudge," leaving the patient's level of engagement unchanged.
- **3 (Somewhat Disagree):** Minor Violation. Feels slightly more like a chore than a choice.
- **2 (Disagree):** Clear Violation. Unmotivating; uses a dry or clinical tone that discourages engagement.
- **1 (Strongly Disagree):** Severe Violation. Actively discouraging or demotivating.$$ where stable_key = 'mot_motivating';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the power dynamic of the tone. Use a score of **3 or lower** if the AI sounds like a lecturer rather than a partner; below are some examples:
- **Simplistic Praise:** Using "Good job!" or similar phrases in a way that feels childlike or insincere.
- **Instructional Superiority:** Explaining basic life tasks or activities as if the patient is incapable of understanding them.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Perfectly collaborative; the patient feels in control of their health journey.
- **6 (Agree):** Good. Respectful and partner-like; avoids being pushy.
- **5 (Somewhat Agree):** Acceptable. The nudge is professional and avoids being pushy. It provides a clear path forward but relies on a standard "expert-to-patient" tone rather than a collaborative partnership.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The tone is not patronizing, but it is strictly directional. It treats the patient as a passive recipient of a task rather than an empowered participant.
- **3 (Somewhat Disagree):** Minor Violation. Tone feels slightly patronizing or overly prescriptive.
- **2 (Disagree):** Clear Violation. Obvious "talking down"; feels like a lecture.
- **1 (Strongly Disagree):** Severe Violation. Blatantly condescending or belittling to the patient.$$ where stable_key = 'mot_empowering';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the warmth of the message. Use a score of **3 or lower** if the nudge feels cold or overly formal; below are some examples:
- **Cold Professionalism:** Sounds like a legal disclaimer or a cold medical alert rather than a motivational app.
- **Aggressive Directness:** So short or blunt that it feels rude.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Warm, approachable, and very friendly.
- **6 (Agree):** Good. Friendly and pleasant to read.
- **5 (Somewhat Agree):** Acceptable. The nudge is polite and professional. While it lacks personal warmth, it functions as a safe, friendly-enough notification.
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. No blatant coldness is present, but the phrasing is stiff/robotic and provides no sense of supportive warmth or assistant personality.
- **3 (Somewhat Disagree):** Minor Violation. The wording is a bit cold or overly formal for a personal health app.
- **2 (Disagree):** Clear Violation. Unfriendly; feels strictly robotic or disinterested.
- **1 (Strongly Disagree):** Severe Violation. Harsh, rude, or actively unfriendly.$$ where stable_key = 'mot_friendly';

update questions
set body_markdown = $$**Scoring Guidance:** Please evaluate the "do-ability" of the suggestion. Use a score of **3 or lower** if the advice is too vague or physically impossible to do now; below are some examples:
- **Vagueness:** Telling the patient to "be healthy" without a specific task.
- **Logistical Conflict:** Suggesting something they cannot do given their profile (e.g., suggesting an outdoor activity to someone in a location/time that doesn't allow for it).
- **Future-Dating:** Telling them to do something tomorrow or next week instead of focusing on today.

**Scoring Rubric:**
- **7 (Strongly Agree):** Excellent. Suggests a concrete, simple task the patient can do in the next hour.
- **6 (Agree):** Good. Clear and actionable; suggests a practical activity.
- **5 (Somewhat Agree):** Acceptable. Safe and doable, but perhaps a bit generic (e.g., "take the stairs").
- **4 (Neither Agree nor Disagree):** Neutral/Borderline. The task is possible, but requires a moderate amount of effort or planning that isn't fully addressed by the nudge.
- **3 (Somewhat Disagree):** Minor Violation. The activity is a bit vague or will be difficult to achieve today.
- **2 (Disagree):** Clear Violation. Impractical or too vague to be actionable.
- **1 (Strongly Disagree):** Severe Violation. Completely non-actionable or physically impossible for the patient.$$ where stable_key = 'act_actionable';

insert into question_bundle_items (bundle_id, question_id, position_index)
select
  'bundle_a',
  q.id,
  row_number() over (
    order by
      case q.axis when 'context_inclusion' then 1 when 'appropriateness' then 2 else 3 end,
      q.stable_key
  )
from questions q
where q.axis in ('context_inclusion', 'appropriateness') and q.active = true
on conflict (bundle_id, question_id) do update
set position_index = excluded.position_index;

insert into question_bundle_items (bundle_id, question_id, position_index)
select
  'bundle_b',
  q.id,
  row_number() over (
    order by
      case q.axis when 'coherence' then 1 when 'motivation' then 2 when 'actionability' then 3 else 4 end,
      q.stable_key
  )
from questions q
where q.axis in ('coherence', 'motivation', 'actionability') and q.active = true
on conflict (bundle_id, question_id) do update
set position_index = excluded.position_index;

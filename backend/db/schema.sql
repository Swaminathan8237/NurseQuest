-- SkillQuest Database Schema for PostgreSQL

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
  avatar_config TEXT DEFAULT '{}',
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  last_active TIMESTAMP,
  is_verified BOOLEAN DEFAULT false,
  verification_token TEXT UNIQUE,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily play streak (consecutive CALENDAR DAYS with >=1 quiz played).
-- Distinct from users.streak, which is a consecutive-correct-ANSWER streak written from
-- quiz_attempts.streak_max. Added as ALTERs rather than columns in the CREATE above because
-- the users table already exists in deployed databases, where CREATE TABLE IF NOT EXISTS is
-- a no-op and new columns in the body would never be applied. These are idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak   INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak   INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_played_date DATE;

-- Per-user client preferences (sound FX, timer alerts, ...). Stored as a JSON string in a
-- TEXT column exactly like avatar_config above — serialized/deserialized in application code
-- (no JSONB). DEFAULT '{}' so the existing hardcoded INSERT sites need no change. Idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT DEFAULT '{}';

-- Student profile fields collected at registration (and backfilled by the profile-completion
-- gate for accounts that predate them). Same ALTER treatment and same reason as the block above.
--
-- users.name is deliberately left alone: it is NOT NULL and read by the leaderboard, every
-- report, the avatar header and the verification email. first_name/last_name are additive, and
-- name continues to be written as "First Last", so every existing read keeps working.
--
-- All six are nullable with no default, which makes each ADD COLUMN metadata-only in Postgres —
-- no table rewrite, no meaningful lock on a live database.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS university            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS university_reg_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_section         TEXT;

-- Institution allow-list, mirroring the UNIVERSITIES array in utils/profile.js — the same
-- belt-and-braces treatment role already gets (a CHECK here plus allowedRoles in routes/auth.js).
-- Adding a university means editing both.
--
-- DROP-then-ADD because Postgres has no ADD CONSTRAINT IF NOT EXISTS for a CHECK, and this file
-- is applied in full on every boot. A bare ADD CONSTRAINT would fail on the second boot, and
-- since init.js runs the whole file through one sql.unsafe() — a single implicit transaction
-- whose error is only logged — that one failure would silently roll back every other statement
-- here. Same idiom as the foreign-key rebuilds at the end of this file.
--
-- Passes for every pre-existing row: they are all NULL, and a CHECK only fails on explicit FALSE.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_university_check;
ALTER TABLE users ADD CONSTRAINT users_university_check
  CHECK (university IS NULL OR university IN ('SRIHER', 'ACS'));

-- A registration number is issued BY an institution, so it is unique WITHIN one, not globally:
-- the same string can legitimately belong to a SRIHER student and a different ACS student, and
-- a global index would lock the second one out of the platform permanently.
--
-- The predicate requires BOTH columns because NULLs compare as distinct in a multi-column unique
-- index — without it, (NULL, 'ABC123') could be inserted twice and the constraint would be
-- unenforced. The routes refuse a reg number with no university for the same reason.
--
-- Partial over non-null values is also what makes this safe to add to a live table: every
-- existing row is NULL, so nothing collides at creation time and nothing needs backfilling.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_university_reg_number
  ON users(university, university_reg_number)
  WHERE university_reg_number IS NOT NULL AND university IS NOT NULL;

-- Cohort lookups are always (university, class) — 'CSE A' at SRIHER is not 'CSE A' at ACS.
CREATE INDEX IF NOT EXISTS idx_users_university_class ON users(university, class_section);

-- Quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'General Knowledge',
  difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
  unit INTEGER DEFAULT 1 CHECK(unit BETWEEN 1 AND 15),
  time_per_question INTEGER DEFAULT 30,
  timer_mode TEXT DEFAULT 'fixed',  -- fixed | whole_quiz | per_question | per_type
  total_time INTEGER,               -- whole_quiz mode: total seconds for the entire quiz
  type_time_config TEXT,            -- per_type mode: JSON map of question type -> seconds
  created_by TEXT NOT NULL,
  is_published INTEGER DEFAULT 0,
  is_live INTEGER DEFAULT 0,
  is_live_draft INTEGER DEFAULT 0,  -- hidden throwaway copy created for a single live game
  live_code TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('mcq', 'image', 'video', 'audio', 'jumbled_letters', 'jumbled_sequence', 'slider', 'matching', 'captcha')),
  question_text TEXT NOT NULL,
  media_url TEXT,
  options TEXT, -- JSON array for MCQ options (stored as string for code compatibility)
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  points INTEGER DEFAULT 1,     -- Fixed marks: full marks if correct, 0 if not
  order_index INTEGER DEFAULT 0,
  slider_min REAL,           -- Slider: minimum value
  slider_max REAL,           -- Slider: maximum value
  slider_step REAL DEFAULT 1, -- Slider: step increment
  slider_unit TEXT,          -- Slider: unit label (e.g. 'mmHg', 'bpm')
  matching_pairs TEXT,       -- Matching: JSON array of {left, right} pairs
  time_limit INTEGER,        -- per_question timer mode: seconds for this question
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- Fixed-marks scoring: default marks per question moved from 1000 to 1. The CREATE above
-- only applies to fresh installs (CREATE TABLE IF NOT EXISTS is a no-op on an existing
-- table), so the deployed default is changed explicitly here. Idempotent.
-- NOTE: this changes the DEFAULT for NEW questions only; it does not rewrite existing rows.
ALTER TABLE questions ALTER COLUMN points SET DEFAULT 1;

-- Quiz attempts (individual)
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  streak_max INTEGER DEFAULT 0,
  time_taken INTEGER DEFAULT 0,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- XP a single attempt was worth (calculateXPEarned: ~100/correct + accuracy/mastery bonuses).
-- Previously computed at submit and discarded into users.xp; persisted now so the leaderboard
-- can rank time-windowed activity (SUM per window) and so users.xp can be recomputed as
-- mastery (Σ MAX(xp_earned) per quiz) instead of inflating on every retry. Nullable / no
-- default so the one-time backfill can find historical rows via WHERE xp_earned IS NULL;
-- SUM/MAX skip NULLs, so windowed boards merely undercount until backfilled rather than error.
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS xp_earned INTEGER;
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_completed
  ON quiz_attempts (user_id, completed_at);

-- Individual question answers
CREATE TABLE IF NOT EXISTS question_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  user_answer TEXT,
  is_correct INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  time_taken INTEGER DEFAULT 0,
  FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);
-- Per-answer outcome state. Distinguishes a wrong answer from a timed-out
-- staged selection from a never-answered question. Nullable: historical rows
-- predate this column and fall back to the is_correct-derived label in the UI.
-- Values: 'correct' | 'incorrect' | 'selected_correct' | 'selected_incorrect' | 'not_answered'.
ALTER TABLE question_answers ADD COLUMN IF NOT EXISTS status TEXT;

-- Live game sessions
CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT,
  host_id TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'finished')),
  current_question INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  quiz_title TEXT,                  -- snapshot: survives deletion of a live-draft quiz
  quiz_time_per_question INTEGER,   -- snapshot: survives deletion of a live-draft quiz
  quiz_unit INTEGER,                -- snapshot: survives deletion of a live-draft quiz
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL,
  FOREIGN KEY (host_id) REFERENCES users(id)
);

-- Live session participants
CREATE TABLE IF NOT EXISTS live_participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  rank INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Achievements / Badges
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🏆',
  requirement_type TEXT NOT NULL,
  requirement_value INTEGER NOT NULL
);

-- User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (achievement_id) REFERENCES achievements(id),
  UNIQUE(user_id, achievement_id)
);

-- Quiz Requests table
CREATE TABLE IF NOT EXISTS quiz_requests (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  unit INTEGER NOT NULL CHECK(unit BETWEEN 1 AND 15),
  teacher_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Unit Unlock Overrides (Admin unlock management)
CREATE TABLE IF NOT EXISTS unit_unlock_overrides (
  id TEXT PRIMARY KEY,
  unit INTEGER NOT NULL CHECK(unit BETWEEN 1 AND 15),
  user_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_code ON live_sessions(join_code);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_quizzes_unit ON quizzes(unit);
CREATE INDEX IF NOT EXISTS idx_quiz_requests_teacher ON quiz_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quiz_requests_status ON quiz_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_unlocks_unit_user ON unit_unlock_overrides (unit, COALESCE(user_id, 'ALL'));
CREATE INDEX IF NOT EXISTS idx_unit_unlocks_unit ON unit_unlock_overrides(unit);
CREATE INDEX IF NOT EXISTS idx_unit_unlocks_user ON unit_unlock_overrides(user_id);

-- ─── Supabase Auth Auto-Sync Trigger ───
-- Automatically synchronizes newly registered users in auth.users to public.users table

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, avatar_config, is_verified)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'student'),
    '{}',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    is_verified = true,
    name = CASE WHEN public.users.name = 'New User' OR public.users.name = '' THEN EXCLUDED.name ELSE public.users.name END;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Admin Pending Deletions (Telegram-Style 5-Second Undo) ───
CREATE TABLE IF NOT EXISTS admin_pending_deletions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('user', 'quiz')),
  entity_id TEXT NOT NULL,
  entity_title TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'committed', 'restored')),
  metadata JSONB DEFAULT '{}'::jsonb,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_deletions_status_expires ON admin_pending_deletions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_deletions_admin ON admin_pending_deletions(admin_id, status);

ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS is_pending_deletion INTEGER DEFAULT 0;

-- ─── Live Game Analytics ───
-- Per-student live game participation record (mirrors quiz_attempts for live games).
CREATE TABLE IF NOT EXISTS live_game_attempts (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  final_score     INTEGER DEFAULT 0,
  total_points    INTEGER DEFAULT 0,
  correct_count   INTEGER DEFAULT 0,
  total_questions  INTEGER DEFAULT 0,
  max_streak      INTEGER DEFAULT 0,
  total_time_ms   INTEGER DEFAULT 0,
  final_rank      INTEGER DEFAULT 0,
  completed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(session_id, user_id)
);

-- Per-question answer record for live games (mirrors question_answers).
CREATE TABLE IF NOT EXISTS live_game_answers (
  id              TEXT PRIMARY KEY,
  attempt_id      TEXT NOT NULL,
  question_id     TEXT,
  question_index  INTEGER DEFAULT 0,
  final_answer    TEXT,
  is_correct      INTEGER DEFAULT 0,
  points_earned   INTEGER DEFAULT 0,
  response_ms     INTEGER DEFAULT 0,
  is_timeout      INTEGER DEFAULT 0,
  is_late         INTEGER DEFAULT 0,
  question_snapshot TEXT,  -- JSON copy of the question, so reports survive quiz deletion
  FOREIGN KEY (attempt_id) REFERENCES live_game_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL
);

-- Selection trail: each option click/change the student made before submitting.
-- Populated for MCQ, image, video, and audio (select-then-confirm UI).
CREATE TABLE IF NOT EXISTS live_answer_selections (
  id              TEXT PRIMARY KEY,
  answer_id       TEXT NOT NULL,
  selection_order INTEGER NOT NULL,
  selected_value  TEXT NOT NULL,
  selected_at     BIGINT NOT NULL,
  elapsed_ms      INTEGER DEFAULT 0,
  FOREIGN KEY (answer_id) REFERENCES live_game_answers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lga_user ON live_game_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_lga_session ON live_game_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_lgans_attempt ON live_game_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_las_answer ON live_answer_selections(answer_id);

ALTER TABLE live_game_answers ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE live_answer_selections ADD COLUMN IF NOT EXISTS is_correct INTEGER DEFAULT 0;

-- Ensure live_game_attempts.user_id cascades on user deletion (existing DBs).
ALTER TABLE live_game_attempts DROP CONSTRAINT IF EXISTS live_game_attempts_user_id_fkey;
ALTER TABLE live_game_attempts ADD CONSTRAINT live_game_attempts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ─── Timer Modes ───
-- A quiz picks ONE timer mode. time_per_question stays the 'fixed' value and the
-- universal fallback, so quizzes created before this migration keep their behaviour.
ALTER TABLE quizzes   ADD COLUMN IF NOT EXISTS timer_mode TEXT DEFAULT 'fixed';
ALTER TABLE quizzes   ADD COLUMN IF NOT EXISTS total_time INTEGER;
ALTER TABLE quizzes   ADD COLUMN IF NOT EXISTS type_time_config TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_limit INTEGER;
UPDATE quizzes SET timer_mode = 'fixed' WHERE timer_mode IS NULL;

-- ─── Live-Only Quiz Drafts ───
-- Hosting a live game clones the quiz into a hidden throwaway copy so last-minute
-- edits never touch the original. The clone is deleted once the game finishes, so
-- the analytics below must not depend on it still existing.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS is_live_draft INTEGER DEFAULT 0;

-- A live-draft clone deliberately sets unit = NULL so it can never be picked up by a unit-scoped
-- query (see the comment on the clone INSERT in routes/quizzes.js). That leaves the unit
-- unreachable at hosting time, which live analytics needs, so the clone records where it came
-- from here instead. Only live drafts ever set it; it is never used for scoping.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS source_unit INTEGER;

-- Snapshots taken when the session/answers are written, used as the fallback source
-- for reporting after the cloned quiz and its questions are gone.
ALTER TABLE live_sessions      ADD COLUMN IF NOT EXISTS quiz_title TEXT;
ALTER TABLE live_sessions      ADD COLUMN IF NOT EXISTS quiz_time_per_question INTEGER;
-- The unit is snapshotted for the same reason as the title, but it is needed for a second one:
-- filtering live analytics by unit. quizzes.unit is unreachable once the clone is deleted, so
-- sessions that ran before this column existed stay NULL and are reported as "unit unknown"
-- rather than being silently folded into some unit. There is nothing left to backfill from.
ALTER TABLE live_sessions      ADD COLUMN IF NOT EXISTS quiz_unit INTEGER;
ALTER TABLE live_game_answers  ADD COLUMN IF NOT EXISTS question_snapshot TEXT;

-- Deleting the clone must null these references instead of being blocked by them.
ALTER TABLE live_sessions ALTER COLUMN quiz_id DROP NOT NULL;
ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_quiz_id_fkey;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_quiz_id_fkey
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL;

ALTER TABLE live_game_answers ALTER COLUMN question_id DROP NOT NULL;
ALTER TABLE live_game_answers DROP CONSTRAINT IF EXISTS live_game_answers_question_id_fkey;
ALTER TABLE live_game_answers ADD CONSTRAINT live_game_answers_question_id_fkey
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quizzes_live_draft ON quizzes(is_live_draft);


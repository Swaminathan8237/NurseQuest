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

-- Quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'General Knowledge',
  difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
  unit INTEGER DEFAULT 1 CHECK(unit BETWEEN 1 AND 15),
  time_per_question INTEGER DEFAULT 30,
  created_by TEXT NOT NULL,
  is_published INTEGER DEFAULT 0,
  is_live INTEGER DEFAULT 0,
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
  quiz_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'finished')),
  current_question INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
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


# Design: Fix hosted quiz media — options compared + chosen design

**Date:** 2026-08-04 (updated 2026-08-05 — folds in the bulk image-association task)
**Status:** Proposed (plan only — no code, no bucket, no DB writes yet)
**Project:** NurseQuest (Supabase ref `rhiyjaoxbrgxkddqzttt`, ap-south-1)
**Scope:** (1) migrate quiz media to Supabase Storage; (2) attach the 33 `just_size_checking/` images to units 1–11, questions 10/11/12.

---

## Context — the problem

Quiz question media (images / video / audio) is uploaded via `POST /api/upload`
([backend/server.js:87-101](../../../backend/server.js#L87-L101)) and written to **local disk** by
multer (`./uploads/{images,videos,audio}/<uuid><ext>`). The DB stores only a **relative path** in
`questions.media_url` (e.g. `/uploads/images/<uuid>.png`), and every frontend site renders it
**verbatim** as an `src`.

Local and hosted (EC2 `65.1.132.43`) share **one** Supabase database but have **separate disks**.
On the server, nginx *proxies* `/uploads/` to Express ([nginx/skillquest.conf:76-83](../../../nginx/skillquest.conf#L76)),
which serves from `/var/www/skillquest/backend/uploads/` — a directory that never received the
laptop's files. `backend/uploads/**` is gitignored ([.gitignore:28-33](../../../.gitignore#L28-L33))
and `deploy.sh` does nothing with it ([scripts/deploy.sh](../../../scripts/deploy.sh) only pulls,
installs, builds, pm2-reloads). So the hosted site has the DB rows but not the files →
`http://65.1.132.43/uploads/images/…png` → **404 → broken images** in Unit 1.

**Verified scope (read-only, 2026-08-04):**
- `questions` with non-empty `media_url`: **4 rows**, all `/uploads/...`, none absolute yet.
- Files present locally: **3 of 4** (`c6561b00`, `8c21acad`, `a7041ea5`). The 4th, `d0cebdf8-…png`
  (Unit 1 Q10), is gone from disk — but **recoverable**: it is the ICU-ventilator image now committed
  as `just_size_checking/Unit 1/1.png` (content-verified). See the Bulk-image section below.
- `storage.buckets` is **empty** — no bucket exists yet.
- **No Supabase client exists anywhere** in the code — only raw env reads
  ([auth.js:13-14](../../../backend/routes/auth.js#L13), [server.js:106-107](../../../backend/server.js#L106)).
  This migration introduces the first one (backend-only).
- **Every render site uses the URL verbatim** — no base-URL prefixing anywhere:
  [QuizPlayer.jsx:753-1253](../../../frontend/src/pages/QuizPlayer.jsx#L753),
  [LiveGame.jsx:827-1290](../../../frontend/src/pages/LiveGame.jsx#L827),
  [QuizBuilder.jsx:532-538](../../../frontend/src/pages/QuizBuilder.jsx#L532),
  [ImportQuizModal.jsx:768-774](../../../frontend/src/components/ImportQuizModal.jsx#L768).
  Both upload callers just read `data.url`. → **an absolute `https://…` URL renders as-is; frontend
  needs zero changes.**

## Goal

Media must render identically on local + hosted from a **single shared source of truth**, survive
deploys / EC2 replacement, and need no per-deploy file copying.

---

## Options compared

| Dimension | **A · Supabase Storage** | **B · rsync files to EC2** | **C · AWS S3 + CloudFront** | **D · Postgres bytea** | **E · commit to git** |
|---|---|---|---|---|---|
| Fixes multi-host root cause | ✅ | ❌ two-writer divergence remains | ✅ | ✅ | ⚠️ runtime uploads never re-committed |
| Frontend change | none | none | none | needs serve route (+maybe prefix) | none |
| Backend code change | upload route only | none | upload route | upload + serve route | none |
| New dependency | `@supabase/supabase-js` | none | `@aws-sdk/*` + `multer-s3` | none | none |
| New secret / infra | service-role key | none (SSH key exists) | AWS IAM creds + bucket policy + CORS | none | none |
| New vendor / billing | **no** (already on Supabase) | no | **yes** (2nd cloud) | no | no |
| Survives EC2 rebuild/replace | ✅ | ❌ unless EBS + backup | ✅ | ✅ | ✅ old files, ❌ new uploads |
| Handles 50 MB video well | ✅ | ✅ | ✅ | ❌ DB bloat | ❌ repo bloat |
| Recovers missing `d0cebdf8` | ✅ via committed png | ✅ via png | ✅ via png | ✅ via png | ✅ via png |
| Effort | **medium** | low (stopgap) | medium–high | high | low but wrong |
| Verdict | **✅ recommended** | stopgap only | overkill | anti-pattern | anti-pattern |

**A · Supabase Storage** — public bucket; backend uploads server-side (service-role) and stores the
absolute public URL. Uses infra they already run; free tier covers this; frontend untouched.

**B · rsync/scp to EC2** — copy files now, add an rsync step to deploy. Legitimate *stopgap*, but it
doesn't fix the architecture: uploads made on the laptop and uploads made on the live site each land
on only one disk, so the two hosts keep diverging. Durable variant = mount a persistent **EBS/EFS**
volume at `backend/uploads/` and only ever upload via the hosted app — still excludes local dev and
still won't recover past laptop uploads. Good for a same-day demo; not the fix.

**C · S3 + CloudFront** — the "textbook" object store, but adds a **second cloud vendor**, IAM, bucket
policy, CORS, and a new SDK for zero benefit over the Supabase Storage they already have.

**D · Postgres `bytea`** — single source of truth, but storing 50 MB videos as DB blobs bloats the DB
and backups, hurts latency, and needs a streaming serve endpoint. Anti-pattern for large binaries.

**E · un-gitignore uploads** — binaries in git bloat the repo, and runtime uploads on the live server
never return to git, so prod and repo drift immediately. Rejected.

### Recommendation → **Option A (Supabase Storage)**

It is the only choice that fixes the *root* cause (one shared store both hosts read) **and** reuses
existing infra with **no frontend changes and no second vendor**. It also matches the user's original
instinct ("create a Bucket to store Multimedia files"). B is worth keeping in the back pocket as a
5-minute demo band-aid, nothing more.

---

## Chosen design (Option A)

### Decisions (resolved)

1. **One public bucket `quiz-media`** with folders `images/`, `videos/`, `audio/` mirroring today.
   **Public read** = parity with today's unauthenticated `/uploads`. **No public write.**
2. **Server-side uploads via service-role key.** Backend builds a Supabase client from `SUPABASE_URL`
   + new **`SUPABASE_SERVICE_ROLE_KEY`** (server-only) and uploads the file buffer. Service-role
   bypasses Storage RLS, so no insert policy is needed. *Why service-role and not anon+JWT:* auth uses
   an app-issued cookie JWT (`skillquest_token`), not a Supabase Auth session, so there's no
   Supabase-signed token to satisfy Storage RLS — server-side service-role is the correct pattern.
3. **Absolute public URL in `media_url`.** `/api/upload` keeps its exact JSON shape
   (`{ url, filename, size, mimetype }`); `url` becomes
   `https://<ref>.supabase.co/storage/v1/object/public/quiz-media/images/<uuid>.png`. Frontend reads
   `data.url` and renders `media_url` verbatim → **no frontend edits**.
4. **Keep `/uploads` route + old rows working during transition.** No nginx change; old relative URLs
   still resolve locally until migrated. After migration the static route is vestigial but harmless.
5. **Add `@supabase/supabase-js` to the backend** (currently absent; backend has `multer ^2`,
   `uuid ^11` only). Alternative — hand-rolled Storage REST via `fetch` — rejected as more brittle.

### Data flow (after change)

```
QuizBuilder / ImportQuiz --multipart 'media'--> POST /api/upload (authenticated)
      -> multer memoryStorage -> req.file.buffer
      -> supabase.storage.from('quiz-media').upload('images/<uuid>.png', buffer, {contentType})
      -> getPublicUrl(...) -> https://<ref>.supabase.co/.../<uuid>.png
      -> res.json({ url: publicUrl, filename, size, mimetype })
      -> saved into questions.media_url
QuizPlayer / LiveGame <img|video|audio src={media_url}> loads the SAME url on local AND hosted (CDN)
```

### Components to change

| # | File / place | Change |
|---|---|---|
| 1 | Supabase project | Create **public** bucket `quiz-media`. |
| 2 | root `.env` (local + EC2) | Add `SUPABASE_SERVICE_ROLE_KEY` (server-only). `SUPABASE_URL` already present. |
| 3 | [backend/package.json](../../../backend/package.json) | Add `@supabase/supabase-js`. |
| 4 | new `backend/lib/supabaseStorage.js` | Service-role client + `uploadToBucket(buffer, mimetype, ext) → publicUrl`. |
| 5 | [backend/server.js:61-101](../../../backend/server.js#L61) | multer `diskStorage`→`memoryStorage`; in `/api/upload`, upload buffer to `quiz-media`, return public URL. Keep 50 MB limit + `^(image|video|audio)/` filter. |
| 6 | new `backend/scripts/migrate-media-to-bucket.js` | **(a) Bulk image association** — upload the 33 `just_size_checking/Unit N/{1,2,3}.png` images to `quiz-media/images/` and apply the per-row changes in the Bulk-image table below (33 UPDATEs, before/after printed for approval). **(b) Orphan** — migrate the stray surviving `/uploads` file `a7041ea5` + repoint its row. Log before-values for rollback; idempotent; wrap writes in one transaction. |

**No change:** all frontend render/upload sites, `/uploads` route, nginx, `/api/config`, auth,
scoring, DB schema (reuse existing `media_url` text column).

---

## Bulk image association (units 1–11 · questions 10/11/12)

Questions 10/11/12 of each unit are the intended image questions. The repo now ships the 33 real
images in `just_size_checking/Unit <N>/{1,2,3}.png` (committed in `e617a75`). Mapping (user-confirmed,
spot-checked against question text for units 1/2/10 — ventilator, N95, fire extinguisher all matched):
`1.png → Q10`, `2.png → Q11`, `3.png → Q12`, i.e. `order_index` 9/10/11.

**Current DB state of the 33 target rows (verified read-only 2026-08-05):**
- **Unit 1** (ids `83efe727` / `5747dddd` / `3d8ca5e3`): already `type=image` with media; **no** 📷 prefix.
- **Units 2–11** (30 rows): `type=mcq`, **no** media, and each `question_text` leads with
  `📷 <description>.` — the image is only *described*, never attached.

**Why the `type` flip is mandatory (not cosmetic):** both render paths gate the `<img>` on
`type==='image'` ([QuizPlayer.jsx:751](../../../frontend/src/pages/QuizPlayer.jsx#L751),
[LiveGame.jsx:825](../../../frontend/src/pages/LiveGame.jsx#L825)). Options render for
`['mcq','image','video','audio']` ([QuizPlayer.jsx:789](../../../frontend/src/pages/QuizPlayer.jsx#L789),
[LiveGame.jsx:852](../../../frontend/src/pages/LiveGame.jsx#L852)) — so flipping `mcq→image` **keeps the
options + correct answer intact** in single-player and multiplayer.

**Per-row changes (33 UPDATEs):**

| Rows | `media_url` | `type` | `question_text` |
|---|---|---|---|
| Unit 1 (3) | → bucket URL of `Unit 1/{1,2,3}.png` (**replace** existing — user choice) | unchanged (`image`) | unchanged (no prefix) |
| Units 2–11 (30) | → bucket URL of `Unit N/{1,2,3}.png` | `mcq` → **`image`** | **strip** `📷 <description>.` prefix |

**Prefix-strip rule (user choice):** remove from the leading `📷 ` through the **first** `.` inclusive.
Verified safe — every description is a period-free noun phrase, so the first `.` always ends it
(`📷 N95 respirator mask.What is its primary purpose?` → `What is its primary purpose?`). The migration
**prints each before/after** for eyeball approval before committing; it does not trust the regex blind.

The stray 4th media row `a7041ea5` (`unit` = null, file present locally) is **not** one of the 33; the
generic Storage migration carries it along, untouched otherwise.

### The formerly-missing file — now recovered

`d0cebdf8-…png` (Unit 1 Q10) is gone from disk, but `just_size_checking/Unit 1/1.png` is the same
ICU-ventilator image (content-verified) and repoints Q10 as part of Unit 1's "replace all 3". There is
no longer any unrecoverable media.

### Security

- **Public read is intentional** (media already served unauthenticated today). Revisit with signed
  URLs only if media becomes sensitive — out of scope.
- **RLS verified enabled (read-only, 2026-08-05).** All 11 `public` tables + all `storage` tables have
  `rowsecurity = true` with **0 policies** → the anon key exposed via `/api/config` is **deny-all**
  through PostgREST and cannot read/write any table. The app functions because the backend connects as a
  privileged (RLS-exempt) Postgres role and uploads use the RLS-bypassing service-role key. A **public**
  `quiz-media` bucket grants public *read* at the Storage-ACL level (independent of `storage.objects`
  RLS); **no public write** is added. This migration leaves the RLS posture unchanged.
- **Service-role key is full-access — a leak is a total DB compromise** (it bypasses RLS). Rules: it
  lives in the server `.env` only (local + EC2), is read in exactly one file
  (`backend/lib/supabaseStorage.js`) via `process.env`, and is exposed via **nothing** — never returned
  by `/api/config` or any endpoint, never logged or placed in an error response, never `VITE_`-prefixed,
  and never imported by any `frontend/` file (Vite bundles only `VITE_*` vars + client-imported code, so
  the key must be neither). Verify post-build by grepping `frontend/dist/` for the key value (must be
  empty). Keep the mimetype allow-list + 50 MB cap; optionally also validate the extension.
- **Standing item:** rotate the previously chat-exposed secrets (Resend key, DB password, JWT secret)
  during this pass.

### Ordered steps (when approved)

1. Create public bucket `quiz-media`.
2. Add `SUPABASE_SERVICE_ROLE_KEY` to local `.env` (later EC2 `.env`).
3. Add `@supabase/supabase-js`; `npm install` in `backend/`.
4. `backend/lib/supabaseStorage.js` — client + `uploadToBucket()`.
5. Rewire `/api/upload` (memoryStorage + upload + public URL, same JSON shape).
6. Run `migrate-media-to-bucket.js`: upload the 33 `just_size_checking` images + apply the 33 per-row UPDATEs (Unit 1 repoint; units 2–11 `type→image` + `media_url` + strip 📷), plus the `a7041ea5` orphan. **← the only DB-writing step (~34 UPDATEs in one transaction); prints every before/after and needs explicit go-ahead.** Recommend a `db-migration-reviewer` pass on the script first.
7. Deploy: add key to EC2 `.env`, `npm run install:all`, build, pm2 restart.

### Verification

- Static: `node --check backend/server.js`; confirm service-role key absent from `/api/config` + bundle.
- Local smoke: upload in QuizBuilder → object in `quiz-media` → `media_url` is `…supabase.co…` → renders.
- Migration: `SELECT COUNT(*) FROM questions WHERE media_url LIKE 'http%'` = **34** (33 targets + `a7041ea5`).
  All 33 target rows `type='image'`; **zero** rows in units 2–11 Q10/11/12 still `LIKE '📷%'`; each of the
  33 objects exists in `quiz-media/images/`.
- Content: open units 1/2/10 in QuizPlayer → the 3 images per unit render, options intact, text clean.
- Hosted: images render on `65.1.132.43` for units 1–11 Q10/11/12 — original bug closed.

### Rollback

Old `/uploads` route stays live, so pre-migration behaviour is intact until step 6. The migration runs
in one transaction and logs every row's prior `type` / `media_url` / `question_text`; to revert, restore
the 33 (+1) rows from that log. Because the run is one transaction, a mid-run failure rolls back cleanly
with no partial state.

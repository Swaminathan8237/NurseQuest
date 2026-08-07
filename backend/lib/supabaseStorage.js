// Supabase Storage helper — uploads quiz media to the `quiz-media` bucket and
// returns a public URL. This replaces local-disk storage so that images/audio/
// video render identically on the developer laptop and the hosted server, which
// share one Supabase database but have separate local disks.
//
// SECURITY: this module is the ONLY place the service-role key is read. It is
// referenced by env name (SUPABASE_SERVICE_ROLE_KEY) and must NEVER be logged,
// returned in a response, echoed in an error, given a VITE_ prefix, or imported
// into any frontend code. A leak of this key is critical — it bypasses RLS.

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const BUCKET = 'quiz-media';

let clientInstance = null;

// True only when both the URL and the service-role key are present in the
// environment. Callers use this to fail loudly rather than silently falling
// back to a broken state.
function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient() {
  if (!isConfigured()) {
    // Deliberately does not include either value — name only.
    throw new Error(
      'Supabase Storage is not configured: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are missing from the environment.'
    );
  }
  if (!clientInstance) {
    clientInstance = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return clientInstance;
}

// Mirror the old on-disk folder routing so bucket layout matches what the code
// (and humans) already expect: images/, videos/, audio/.
function folderForMime(mimetype) {
  if (typeof mimetype === 'string' && mimetype.startsWith('video/')) return 'videos';
  if (typeof mimetype === 'string' && mimetype.startsWith('audio/')) return 'audio';
  return 'images';
}

// Build the public URL for an object path. Pure string construction via the SDK
// — no network call — so callers (e.g. a migration dry-run) can preview the URL
// an upload WOULD produce without writing anything.
function getPublicUrl(objectPath) {
  const { data } = getClient().storage.from(BUCKET).getPublicUrl(objectPath);
  if (!data || !data.publicUrl) {
    throw new Error(`Could not derive a public URL for "${objectPath}".`);
  }
  return data.publicUrl;
}

// Low-level upload to an explicit object path. Returns { path, publicUrl }.
// `opts.mimetype` sets Content-Type; `opts.upsert` overwrites an existing object
// (used by the idempotent migration; the runtime uploader below never upserts).
async function uploadObject(objectPath, buffer, opts = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('uploadObject: a non-empty Buffer is required.');
  }
  const { error } = await getClient().storage
    .from(BUCKET)
    .upload(objectPath, buffer, {
      contentType: opts.mimetype || 'application/octet-stream',
      upsert: Boolean(opts.upsert),
      cacheControl: '31536000', // 1 year — objects are immutable per unique path
    });
  if (error) {
    // error.message describes the failure (bucket missing, object exists, …);
    // it never contains the service-role key.
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }
  return { path: objectPath, publicUrl: getPublicUrl(objectPath) };
}

// Runtime uploader used by POST /api/upload: routes by mimetype into a folder
// and gives the object a random uuid name (no collisions, no upsert). `ext`
// should include the dot (e.g. ".png"); if omitted, no extension is added.
async function uploadToBucket(buffer, mimetype, ext) {
  const folder = folderForMime(mimetype);
  const safeExt = (ext && ext.startsWith('.')) ? ext : (ext ? `.${ext}` : '');
  const objectPath = `${folder}/${uuidv4()}${safeExt}`;
  return uploadObject(objectPath, buffer, { mimetype, upsert: false });
}

module.exports = { uploadToBucket, uploadObject, getPublicUrl, isConfigured, folderForMime, BUCKET };

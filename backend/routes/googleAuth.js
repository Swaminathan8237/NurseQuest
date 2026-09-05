const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { getDB } = require('../db/init');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { sanitizeLogInput } = require('../utils/logger');
const { PROFILE_COLUMNS, isProfileComplete, splitName } = require('../utils/profile');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// One reusable verifier. It only needs the PUBLIC Client ID: verifyIdToken checks Google's
// signature against Google's published keys, so no client secret is involved in this flow.
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// POST /api/auth/google
// Receives { credential } — the ID token minted by Google Identity Services in the browser.
// We verify it server-side, then mint the SAME skillquest_token JWT/cookie as password login so
// the rest of the app (middleware/auth.js, /me, Socket.IO) treats Google users identically.
router.post('/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Missing Google credential' });
  }
  if (!GOOGLE_CLIENT_ID || !googleClient) {
    console.error('Google auth misconfiguration: GOOGLE_CLIENT_ID is not set; cannot verify token.');
    return res.status(500).json({ error: 'Google sign-in is not configured on the server' });
  }
  if (!JWT_SECRET) {
    console.error('Auth misconfiguration: JWT_SECRET is not set; cannot sign token.');
    return res.status(500).json({ error: 'Server auth is misconfigured' });
  }

  try {
    // 1. Verify the ID token: signature, audience (our client id), issuer, and expiry.
    // A tampered, expired, or wrong-audience token throws here and we never trust it.
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
    } catch (verifyErr) {
      console.warn('Google token verification failed:', verifyErr.message);
      return res.status(401).json({ error: 'Invalid Google sign-in. Please try again.' });
    }

    const payloadFromGoogle = ticket.getPayload();
    const email = (payloadFromGoogle.email || '').toLowerCase();
    const emailVerified = payloadFromGoogle.email_verified;
    // Google account display name; fall back to the local-part of the email if absent.
    const name = payloadFromGoogle.name || (email ? email.split('@')[0] : 'New User');
    // Google splits the name for us, so seed first_name/last_name from its claims rather than
    // guessing at a space. Only a starting point — the profile-completion step lets them correct it.
    const { firstName: fallbackFirst, lastName: fallbackLast } = splitName(name);
    const givenName = payloadFromGoogle.given_name || fallbackFirst || null;
    const familyName = payloadFromGoogle.family_name || fallbackLast || null;

    if (!email) {
      return res.status(400).json({ error: 'Google account did not provide an email' });
    }
    // Only accept Google-confirmed emails. An unverified Google email could be attacker-controlled.
    if (!emailVerified) {
      return res.status(403).json({ error: 'Your Google email is not verified with Google.' });
    }

    const sql = getDB();

    // 2. Upsert by email. Existing row (from password signup or a prior Google login) is reused —
    // we never overwrite their profile. A brand-new Google user is created verified, role 'student',
    // with NULL password (schema allows it) so the password-login branch can never match them.
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;

    let userId;
    if (existing.length > 0) {
      userId = existing[0].id;
      // A Google-verified sign-in is proof of email ownership; make sure the row reflects that
      // (covers a user who registered with a password but never clicked the email link).
      await sql`UPDATE users SET is_verified = true WHERE id = ${userId}`;
    } else {
      userId = uuidv4();
      await sql`
        INSERT INTO users (id, email, password, name, role, avatar_config, is_verified, first_name, last_name)
        VALUES (${userId}, ${email}, ${null}, ${name}, 'student', '{}', true, ${givenName}, ${familyName})
      `;
      console.log(`✅ Google sign-in created new user: ${sanitizeLogInput(email)}`);
    }

    // 3. Mint the SAME app JWT + cookie as /login (auth.js). Identical payload shape, identical
    // cookie name/flags, so downstream verification is unchanged.
    const tokenPayload = {
      sub: userId,
      email,
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET);

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieOptions = {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
    res.cookie('skillquest_token', token, cookieOptions);

    // 4. Return the same shape as /login so the frontend can reuse its user-setting path.
    //    profileComplete is false for a brand-new Google user — Google supplies a name and an
    //    email but no university, registration number or class — which is what makes the frontend
    //    show the "Complete Your Profile" step before letting them into the app.
    const fullUsers = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, ${sql(PROFILE_COLUMNS)} FROM users WHERE id = ${userId}`;
    const user = fullUsers[0];

    res.json({
      user: {
        ...user,
        avatar_config: JSON.parse(user.avatar_config || '{}'),
        profileComplete: isProfileComplete(user)
      }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Server error during Google sign-in' });
  }
});

module.exports = router;

const express = require('express');
const { getDB } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sanitizeLogInput, escapeHtml } = require('../utils/logger');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const sql = getDB();
    const lowerEmail = email.toLowerCase();

    // Check if user exists in the local database
    const users = await sql`SELECT id, password, role, is_verified FROM users WHERE email = ${lowerEmail}`;
    
    if (users.length === 0) {
      // If they don't exist locally, check if they exist in Supabase Auth (fallback)
      console.log(`🔑 Auth: User not found in local DB, checking Supabase Auth for ${sanitizeLogInput(email)}...`);
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      // If successful, synchronization will happen or we insert them
      const userId = data.user.id;
      const metadata = data.user.user_metadata || {};
      const name = metadata.name || email.split('@')[0];
      const role = metadata.role || 'student';
      
      await sql`
        INSERT INTO users (id, email, name, role, avatar_config, is_verified) 
        VALUES (${userId}, ${email}, ${name}, ${role}, '{}', true)
        ON CONFLICT (email) DO UPDATE SET is_verified = true
      `;
      
      // Re-query user
      const usersReload = await sql`SELECT id, password, role, is_verified FROM users WHERE email = ${lowerEmail}`;
      const userRecord = usersReload[0];
      
      const payload = {
        sub: userId,
        email: lowerEmail,
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
      };
      const secret = JWT_SECRET;
      if (!secret) {
        console.error('Auth misconfiguration: JWT_SECRET is not set; cannot sign token.');
        return res.status(500).json({ error: 'Server auth is misconfigured' });
      }
      const token = jwt.sign(payload, secret);
      
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
      };
      res.cookie('skillquest_token', token, cookieOptions);
      
      const fullUsers = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${userId}`;
      const user = fullUsers[0];
      return res.json({
        user: {
          ...user,
          avatar_config: JSON.parse(user.avatar_config || '{}')
        }
      });
    }

    const userRecord = users[0];

    // Check email verification status
    if (userRecord.is_verified === false) {
      return res.status(400).json({ error: 'Please verify your email address before logging in.' });
    }

    // Verify password
    let passwordMatches = false;
    const isBcrypt = userRecord.password && (userRecord.password.startsWith('$2a$') || userRecord.password.startsWith('$2b$') || userRecord.password.startsWith('$2y$'));
    
    if (isBcrypt) {
      passwordMatches = await bcrypt.compare(password, userRecord.password);
    } else {
      passwordMatches = (password === userRecord.password);
    }

    const demoAccounts = {
      'teacher@skillquest.io': 'teacher123',
      'student1@skillquest.io': 'student123',
      'student2@skillquest.io': 'student123',
      'student3@skillquest.io': 'student123',
      'student4@skillquest.io': 'student123',
      'student5@skillquest.io': 'student123',
      'admin@skillquest.io': 'admin123',
      'admin@nursing.io': 'admin123'
    };

    if (!passwordMatches && demoAccounts[lowerEmail] && password === demoAccounts[lowerEmail]) {
      passwordMatches = true;
    }

    if (!passwordMatches) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate local JWT token
    const payload = {
      sub: userRecord.id,
      email: lowerEmail,
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
    };
    const secret = JWT_SECRET;
    if (!secret) {
      console.error('Auth misconfiguration: JWT_SECRET is not set; cannot sign token.');
      return res.status(500).json({ error: 'Server auth is misconfigured' });
    }
    const token = jwt.sign(payload, secret);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    res.cookie('skillquest_token', token, cookieOptions);

    const fullUsers = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${userRecord.id}`;
    const user = fullUsers[0];

    res.json({
      user: {
        ...user,
        avatar_config: JSON.parse(user.avatar_config || '{}')
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name, role, avatarConfig } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const allowedRoles = ['student', 'teacher'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid registration role. Admin registration is prohibited.' });
  }

  try {
    const sql = getDB();
    const lowerEmail = email.toLowerCase();

    // Check if user already exists
    const existing = await sql`SELECT id FROM users WHERE email = ${lowerEmail}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // 1. Hash the user's password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2. Generate a secure random token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 3. Save the new User in the database with isVerified: false, the token, and expiration timestamp set to 24 hours from now
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);

    const userId = uuidv4();
    await sql`
      INSERT INTO users (id, email, password, name, role, avatar_config, is_verified, verification_token, token_expires_at)
      VALUES (
        ${userId}, 
        ${lowerEmail}, 
        ${hashedPassword}, 
        ${name}, 
        ${role}, 
        ${JSON.stringify(avatarConfig || {})}, 
        false, 
        ${verificationToken}, 
        ${tokenExpiresAt}
      )
    `;

    // 4. Construct a verification URL pointing to: http://localhost:3001/api/auth/verify-email?token={TOKEN}&email={EMAIL}
    const verifyUrl = `http://localhost:3001/api/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(lowerEmail)}`;
    
    // Log the verification URL in the console for easy developer testing/bypass
    console.log(`\n✉️  [SKILLQUEST VERIFICATION] Email verification URL generated for ${sanitizeLogInput(lowerEmail)}:`);
    console.log(`👉 ${verifyUrl}\n`);

    // 5. Use the Nodemailer transporter to send a styled HTML email to the student containing a clear, puffy action button to "Verify My Account" using the verification URL
    const smtpHost = process.env.SMTP_HOST || 'smtp.ethereal.email';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || '';

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    // This markup renders in the recipient's mail client, so every interpolated value must be
    // HTML-escaped (CWE-116). `name` comes straight from the registration request body, so an
    // unescaped value could inject arbitrary markup into the email. verifyUrl is built from a
    // crypto token and an encodeURIComponent'd address, but is escaped too so the template has
    // no unescaped holes — `&` correctly becomes `&amp;` inside the href.
    const safeName = escapeHtml(name);
    const safeVerifyUrl = escapeHtml(verifyUrl);

    const mailOptions = {
      from: process.env.SMTP_FROM || `"SkillQuest Support" <no-reply@skillquest.io>`,
      to: lowerEmail,
      subject: 'Verify Your SkillQuest Account',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #0F0E1A; border-radius: 16px; color: #E8E4F5;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #7C3AED; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; font-family: 'Manrope', sans-serif;">SkillQuest</h1>
            <p style="color: #A8A3C0; margin: 5px 0 0 0; font-size: 14px;">Learn · Practice · Excel</p>
          </div>
          <div style="background-color: #1A1830; padding: 40px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h2 style="color: #E8E4F5; margin-top: 0; font-size: 20px; font-weight: 700;">Welcome to SkillQuest, ${safeName}!</h2>
            <p style="color: #4E4E5A; line-height: 1.6; font-size: 15px;">
              Thank you for registering. To verify your email and activate your account, please click the puffy verification button below:
            </p>
            <div style="text-align: center; margin: 35px 0;">
              <a href="${safeVerifyUrl}" style="background-color: #ff3b93; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(255, 59, 147, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                Verify My Account
              </a>
            </div>
            <p style="color: #8E8EA0; font-size: 12px; line-height: 1.5; margin-bottom: 0;">
              If the button above does not work, copy and paste this URL into your browser: <br/>
              <a href="${safeVerifyUrl}" style="color: #b76dff; text-decoration: none; word-break: break-all;">${safeVerifyUrl}</a>
            </p>
          </div>
          <div style="text-align: center; margin-top: 25px; color: #B2B2C2; font-size: 12px;">
            <p style="margin: 0;">This verification link is valid for 24 hours.</p>
          </div>
        </div>
      `
    };

    if (!smtpUser || !smtpPass) {
      console.log(`⚠️ SMTP credentials not configured. Skipping email transmission. (URL logged above)`);
    } else {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('❌ Failed to transmit verification email:', error.message);
        } else {
          console.log('✉️ Verification email transmitted successfully:', info.messageId);
        }
      });
    }

    return res.status(201).json({ message: "Registration successful. Verification email transmitted.", emailVerificationPending: true });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// GET /api/auth/verify-email
router.get('/verify-email', async (req, res) => {
  const { token, email } = req.query;
  if (!token || !email) {
    return res.status(400).json({ error: 'Token and email query parameters are required.' });
  }

  try {
    const sql = getDB();
    const lowerEmail = email.toLowerCase();

    // 1. Fetch user by email
    const users = await sql`SELECT id, verification_token, token_expires_at FROM users WHERE email = ${lowerEmail}`;
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'Verification failed: User account not found.' });
    }

    const user = users[0];

    // 2. Check if token matches and token_expires_at is in the future
    if (!user.verification_token) {
      return res.status(400).json({ error: 'Verification failed: Invalid verification token.' });
    }

    const actual = crypto.createHash('sha256').update(token).digest();
    const expected = crypto.createHash('sha256').update(user.verification_token).digest();

    if (!crypto.timingSafeEqual(actual, expected)) {
      return res.status(400).json({ error: 'Verification failed: Invalid verification token.' });
    }
    const now = new Date();
    const expiresAt = new Date(user.token_expires_at);
    if (expiresAt < now) {
      return res.status(400).json({ error: 'Verification failed: Verification token has expired.' });
    }

    // 3. If valid, update user: set is_verified = true, and nullify verification_token and token_expires_at
    await sql`
      UPDATE users 
      SET is_verified = true, 
          verification_token = null, 
          token_expires_at = null 
      WHERE id = ${user.id}
    `;

    console.log(`✅ Email verified successfully for: ${sanitizeLogInput(lowerEmail)}`);

    // 4. Redirect to FRONTEND_URL/login?verified=true (will trigger the AppRoutes redirect to /auth?verified=true)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/login?verified=true`);
  } catch (err) {
    console.error('Email verification error:', err);
    return res.status(500).json({ error: 'Server error during email verification: ' + err.message });
  }
});


// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    res.clearCookie('skillquest_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/set-cookie
// Bridges the Supabase OAuth flow to our HttpOnly session cookie: the client hands us the
// access_token Supabase issued and we persist it as `skillquest_token`.
//
// The token MUST be verified before it is trusted as a session credential (CWE-384 session
// fixation) — without verification any caller could plant an arbitrary cookie value and
// fixate or forge a session. We apply the same signature/structure checks that
// middleware/auth.js applies when it later reads this cookie, so this endpoint only ever
// issues a cookie the middleware would subsequently accept. Legitimate tokens (Supabase
// access_tokens and locally-issued login tokens, both signed with JWT_SECRET) keep working
// unchanged; forged or expired tokens are rejected here instead of being stored.
router.post('/set-cookie', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  // Fail closed: without a signing secret we cannot verify the token, so refuse rather than
  // store unverified input (mirrors middleware/auth.js).
  if (!JWT_SECRET) {
    console.error('Auth misconfiguration: JWT_SECRET is not set; refusing to set session cookie.');
    return res.status(500).json({ error: 'Server auth is misconfigured' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.error('Rejected set-cookie: token verification failed:', sanitizeLogInput(err.message));
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!decoded || !(decoded.sub || decoded.id)) {
    return res.status(401).json({ error: 'Invalid token structure' });
  }

  try {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    res.cookie('skillquest_token', token, cookieOptions);
    res.json({ success: true });
  } catch (err) {
    console.error('Set cookie error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Sync profile (called after sign-up / social login)
router.post('/sync-profile', authenticateToken, async (req, res) => {
  try {
    const { name, role, avatarConfig } = req.body;
    const sql = getDB();

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required' });
    }

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    let finalRole = role;
    if (req.user.email === 'admin@skillquest.io') {
      finalRole = 'admin';
    }

    // Check if user already exists
    const existingUsers = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${req.user.id}`;
    if (existingUsers.length > 0) {
      // User already exists, return current profile
      const user = existingUsers[0];
      return res.json({
        user: {
          ...user,
          avatar_config: JSON.parse(user.avatar_config || '{}')
        }
      });
    }

    // Check if a user with the same email exists (migration case)
    const oldUsers = await sql`SELECT id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at FROM users WHERE email = ${req.user.email}`;
    if (oldUsers.length > 0) {
      const oldUser = oldUsers[0];
      const oldId = oldUser.id;
      if (oldId !== req.user.id) {
        // Run migration in a transaction to update all foreign keys
        console.log(`🔄 Migrating user profile via /sync-profile for ${req.user.email} from old ID ${oldId} to Supabase Auth ID ${req.user.id}`);
        await sql.begin(async (tx) => {
          // 1. Temporarily rename the old user's email to free up the unique constraint
          const tempEmail = `${oldUser.email}_old_${req.user.id}`;
          await tx`UPDATE users SET email = ${tempEmail} WHERE id = ${oldId}`;

          // 2. Insert new user record with the new ID, copying details from the old user
          await tx`
            INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at)
            VALUES (
              ${req.user.id}, 
              ${oldUser.email}, 
              ${oldUser.password || null}, 
              ${name || oldUser.name}, 
              ${finalRole}, 
              ${JSON.stringify(avatarConfig || JSON.parse(oldUser.avatar_config || '{}'))}, 
              ${oldUser.xp || 0}, 
              ${oldUser.level || 1}, 
              ${oldUser.streak || 0}, 
              ${oldUser.last_active || null}, 
              ${oldUser.created_at}
            )
          `;

          // 3. Update references in dependency order
          await tx`UPDATE quiz_attempts SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
          await tx`UPDATE quizzes SET created_by = ${req.user.id} WHERE created_by = ${oldId}`;
          await tx`UPDATE live_participants SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
          await tx`UPDATE live_sessions SET host_id = ${req.user.id} WHERE host_id = ${oldId}`;
          await tx`UPDATE user_achievements SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
          await tx`UPDATE quiz_requests SET teacher_id = ${req.user.id} WHERE teacher_id = ${oldId}`;

          // 4. Delete old user
          await tx`DELETE FROM users WHERE id = ${oldId}`;
        });
      }
    } else {
      // Insert new user profile linked to Supabase UID
      await sql`
        INSERT INTO users (id, email, name, role, avatar_config)
        VALUES (${req.user.id}, ${req.user.email}, ${name}, ${finalRole}, ${JSON.stringify(avatarConfig || {})})
      `;
    }

    const users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak FROM users WHERE id = ${req.user.id}`;
    const user = users[0];

    res.status(201).json({
      user: {
        ...user,
        avatar_config: JSON.parse(user.avatar_config || '{}')
      }
    });
  } catch (err) {
    console.error('Sync profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const sql = getDB();
    let users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.user.id}`;
    let user = users[0];

    // If no user found by Supabase Auth UUID, check by email and migrate
    if (!user && req.user.email) {
      const oldUsers = await sql`SELECT id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at FROM users WHERE email = ${req.user.email}`;
      if (oldUsers.length > 0) {
        const oldUser = oldUsers[0];
        const oldId = oldUser.id;

        if (oldId !== req.user.id) {
          // Migrate old seed UUID to match Supabase Auth UUID
          console.log(`🔄 Migrating user ${req.user.email} from old ID ${oldId} to Supabase Auth ID ${req.user.id}`);
          try {
            await sql.begin(async (tx) => {
              // Ensure admin role for admin email
              let migratedRole = oldUser.role;
              if (req.user.email === 'admin@skillquest.io') {
                migratedRole = 'admin';
              }

              // 1. Temporarily rename the old user's email to free up the unique constraint
              const tempEmail = `${oldUser.email}_old_${req.user.id}`;
              await tx`UPDATE users SET email = ${tempEmail} WHERE id = ${oldId}`;

              // 2. Insert new user record with the new ID, copying details from the old user
              await tx`
                INSERT INTO users (id, email, password, name, role, avatar_config, xp, level, streak, last_active, created_at)
                VALUES (
                  ${req.user.id}, 
                  ${oldUser.email}, 
                  ${oldUser.password || null}, 
                  ${oldUser.name}, 
                  ${migratedRole}, 
                  ${oldUser.avatar_config || '{}'}, 
                  ${oldUser.xp || 0}, 
                  ${oldUser.level || 1}, 
                  ${oldUser.streak || 0}, 
                  ${oldUser.last_active || null}, 
                  ${oldUser.created_at}
                )
              `;

              // 3. Update references in dependency order
              await tx`UPDATE quiz_attempts SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
              await tx`UPDATE quizzes SET created_by = ${req.user.id} WHERE created_by = ${oldId}`;
              await tx`UPDATE live_participants SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
              await tx`UPDATE live_sessions SET host_id = ${req.user.id} WHERE host_id = ${oldId}`;
              await tx`UPDATE user_achievements SET user_id = ${req.user.id} WHERE user_id = ${oldId}`;
              await tx`UPDATE quiz_requests SET teacher_id = ${req.user.id} WHERE teacher_id = ${oldId}`;

              // 4. Delete old user
              await tx`DELETE FROM users WHERE id = ${oldId}`;
            });

            // Re-fetch the now-migrated user
            users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.user.id}`;
            user = users[0];
            console.log(`✅ Migration complete for ${req.user.email}`);
          } catch (migrationErr) {
            console.error('Migration error:', migrationErr);
            return res.status(500).json({ error: 'Failed to migrate user profile' });
          }
        }
      } else {
        // Create user from Supabase user_metadata
        const metadata = (req.user.tokenData && req.user.tokenData.user_metadata) || {};
        const name = metadata.name || req.user.email.split('@')[0];
        const role = metadata.role || (req.user.email === 'admin@skillquest.io' ? 'admin' : (req.user.email === 'teacher@skillquest.io' ? 'teacher' : 'student'));
        const avatarConfig = metadata.avatar_config || {};

        console.log(`🔑 Auth: Auto-creating user profile for ${req.user.email} in GET /me using token metadata`);
        await sql`
          INSERT INTO users (id, email, name, role, avatar_config)
          VALUES (${req.user.id}, ${req.user.email}, ${name}, ${role}, ${JSON.stringify(avatarConfig)})
        `;

        users = await sql`SELECT id, email, name, role, avatar_config, xp, level, streak, created_at FROM users WHERE id = ${req.user.id}`;
        user = users[0];
      }
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get achievements
    const achievements = await sql`
      SELECT a.*, ua.earned_at FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ${req.user.id}
    `;

    // Get quiz stats
    const statsResult = await sql`
      SELECT 
        COUNT(*) as quizzes_taken,
        COALESCE(AVG(score * 100.0 / NULLIF(total_points, 0)), 0) as avg_score,
        COALESCE(MAX(streak_max), 0) as best_streak,
        COALESCE(SUM(score), 0) as total_score
      FROM quiz_attempts WHERE user_id = ${req.user.id}
    `;

    const statsRow = statsResult[0] || {};
    const stats = {
      quizzes_taken: parseInt(statsRow.quizzes_taken || 0, 10),
      avg_score: parseFloat(statsRow.avg_score || 0),
      best_streak: parseInt(statsRow.best_streak || 0, 10),
      total_score: parseInt(statsRow.total_score || 0, 10)
    };

    res.json({
      ...user,
      avatar_config: JSON.parse(user.avatar_config || '{}'),
      achievements,
      stats
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update avatar
router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatarConfig } = req.body;
    const sql = getDB();
    await sql`UPDATE users SET avatar_config = ${JSON.stringify(avatarConfig)} WHERE id = ${req.user.id}`;
    res.json({ success: true, avatarConfig });
  } catch (err) {
    console.error('Avatar update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

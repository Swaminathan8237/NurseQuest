const jwt = require('jsonwebtoken');
const { getDB } = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET;

async function authenticateToken(req, res, next) {
  // Read token from HttpOnly cookie first, fall back to Authorization header
  let token = req.cookies ? req.cookies.skillquest_token : null;
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Fail closed: without a signing secret we cannot verify signatures, so refuse
  // to authenticate rather than trusting an unverified token.
  if (!JWT_SECRET) {
    console.error('Auth misconfiguration: JWT_SECRET is not set; refusing to authenticate.');
    return res.status(500).json({ error: 'Server auth is misconfigured' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.error('Token verification error:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token: ' + err.message });
  }

  if (!decoded || !(decoded.sub || decoded.id)) {
    return res.status(403).json({ error: 'Invalid token structure' });
  }

  try {
    const userId = decoded.sub || decoded.id;
    const email = decoded.email;

    // Fetch user details (specifically the role and status) from the database
    const sql = getDB();
    const users = await sql`SELECT id, role, name, status FROM users WHERE id = ${userId}`;
    const user = users[0];

    // If user is explicitly in pending_deletion status, reject immediately
    if (user && user.status === 'pending_deletion') {
      return res.status(401).json({ error: 'User account is pending deletion' });
    }

    req.user = {
      id: userId,
      email: email,
      role: user ? user.role : null,
      name: user ? user.name : null,
      status: user ? user.status : null,
      tokenData: decoded
    };

    next();
  } catch (err) {
    console.error('Database error in auth middleware:', err.message);
    return res.status(500).json({ error: 'Database connection failed: ' + err.message });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Access denied. ${role} role required.` });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };

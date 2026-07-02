const jwt = require('jsonwebtoken');
const { getDB } = require('../db/init');

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  console.log('🔑 authenticateToken: Received token:', token.substring(0, 20) + '...');
  let decoded;
  try {
    if (!SUPABASE_JWT_SECRET) {
      // Fallback for development if secret isn't provided yet
      decoded = jwt.decode(token);
      console.log('🔑 authenticateToken: Decoded payload:', decoded);
      if (!decoded || !decoded.sub) {
        console.error('🔑 authenticateToken: Missing sub in decoded token:', decoded);
        return res.status(403).json({ error: 'Invalid token structure' });
      }
    } else {
      decoded = jwt.verify(token, SUPABASE_JWT_SECRET);
      console.log('🔑 authenticateToken: Verified payload:', decoded);
    }
  } catch (err) {
    console.error('Token verification error:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token: ' + err.message });
  }

  try {
    const userId = decoded.sub || decoded.id;
    const email = decoded.email;

    // Fetch user details (specifically the role) from the database
    const sql = getDB();
    const users = await sql`SELECT role, name FROM users WHERE id = ${userId}`;
    const user = users[0];

    req.user = {
      id: userId,
      email: email,
      role: user ? user.role : null,
      name: user ? user.name : null
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

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { sanitizeLogInput } = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/googleAuth');
const quizRoutes = require('./routes/quizzes');
const scoreRoutes = require('./routes/scores');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

// Socket.IO handlers
const { initializeSocket } = require('./socket');

const app = express();
// Behind Nginx in production: trust the first proxy hop so req.secure reflects the
// client's X-Forwarded-Proto (→ correct Secure-cookie decisions) and req.ip is the real client.
app.set('trust proxy', 1);

// Allowed CORS / Socket.IO origins. Localhost entries cover local dev; production domains
// arrive via the CORS_ORIGINS env var (comma-separated) so the bundle stays domain-agnostic
// and the same code runs everywhere. Socket.IO enforces this list server-side, so the custom
// domain MUST be present here or real-time connections from it are rejected.
const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:3000', 'http://localhost:5050',
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : []),
];

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
// CSP allow-list (evidence-based): the SPA loads Google Fonts + Material Symbols
// (fonts.googleapis.com / fonts.gstatic.com), DiceBear avatars (api.dicebear.com),
// Supabase Storage media (*.supabase.co), and Google Identity Services
// (accounts.google.com). 'unsafe-inline' is required for style (the app uses inline
// style={{…}} widely) and kept for script as a safety net against any inline the build
// emits. Wildcard *.supabase.co avoids hardcoding the Supabase URL.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com", "https://www.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://api.dicebear.com", "https://*.supabase.co", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://*.supabase.co"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      mediaSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"], // data: — quiz plays short base64 WAV sound effects inline
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // don't require COEP — external <img>/media have no CORP header
  // Sign in with Google opens a cross-origin popup/tab and returns the credential via
  // window.opener → postMessage. Helmet's default COOP `same-origin` severs that link
  // (opener becomes null, so the popup can't hand the token back — sign-in silently does
  // nothing / goes blank, especially on mobile where GIS opens a new tab).
  // `same-origin-allow-popups` still isolates THIS page from any opener while letting the
  // popups we open keep the relationship — the setting Google recommends for GIS.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(cookieParser());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload endpoint (for quiz media: images, videos, audio)
const multer = require('multer');

// Ensure upload directories exist
if (!fs.existsSync('./uploads/images')) {
  fs.mkdirSync('./uploads/images', { recursive: true });
  console.log('📁 Created upload directory: uploads/images');
}
if (!fs.existsSync('./uploads/videos')) {
  fs.mkdirSync('./uploads/videos', { recursive: true });
  console.log('📁 Created upload directory: uploads/videos');
}
if (!fs.existsSync('./uploads/audio')) {
  fs.mkdirSync('./uploads/audio', { recursive: true });
  console.log('📁 Created upload directory: uploads/audio');
}

// Media is uploaded to Supabase Storage (a shared, durable bucket) rather than
// local disk, so the same URL renders on both local and hosted. multer keeps
// the file in memory; the buffer is streamed to the bucket in the handler below.
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: function (req, file, cb) {
    const allowed = /^(image|video|audio)\//;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image, video, and audio files are allowed'));
  }
});

const { authenticateToken: authUpload } = require('./middleware/auth');
const { uploadToBucket, isConfigured: isStorageConfigured } = require('./lib/supabaseStorage');
app.post('/api/upload', authUpload, (req, res) => {
  mediaUpload.single('media')(req, res, async function (err) {
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!isStorageConfigured()) {
      // Fail loud rather than silently writing to local disk, which the hosted
      // server cannot serve (separate disk, no per-deploy sync).
      console.error('Upload rejected: Supabase Storage is not configured on the server.');
      return res.status(503).json({ error: 'Media storage is not configured on the server.' });
    }
    try {
      const ext = path.extname(req.file.originalname) || '';
      const { publicUrl } = await uploadToBucket(req.file.buffer, req.file.mimetype, ext);
      console.log(`✅ File uploaded to Storage: ${sanitizeLogInput(req.file.originalname)} -> ${sanitizeLogInput(publicUrl)}`);
      res.json({ url: publicUrl, filename: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
    } catch (uploadErr) {
      // uploadErr.message comes from the storage helper and never contains the key.
      console.error('Storage upload error:', uploadErr.message);
      res.status(502).json({ error: 'Failed to store uploaded file' });
    }
  });
});

// Public client runtime configuration
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || ''
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Media placeholder endpoint (returns SVG placeholders for demo)
app.get('/api/media/placeholder/:name', (req, res) => {
  const { name } = req.params;

  // Serve actual mock video and audio redirects
  if (name.endsWith('.mp4')) {
    return res.redirect('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4');
  }
  if (name.endsWith('.mp3')) {
    return res.redirect('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
  }

  const placeholders = {
    'heart.svg': generateMedicalSVG('Heart', '#FF6B6B', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'),
    'fracture.svg': generateMedicalSVG('Bone X-Ray', '#A29BFE', 'M8 2v4l-2 2v4l2 2v4l2 2h4l2-2v-4l2-2v-4l-2-2V2h-2v4l-2 2-2-2V2H8z'),
  };

  const svg = (name === 'heart.svg')
    ? placeholders['heart.svg']
    : (name === 'fracture.svg')
      ? placeholders['fracture.svg']
      : generateMedicalSVG('Medical', '#6C5CE7', 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5');
  res.type('image/svg+xml').send(svg);
});

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, tag => {
    switch (tag) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case "'": return '&#39;';
      case '"': return '&quot;';
      default: return tag;
    }
  });
}

function generateMedicalSVG(label, color, pathD) {
  const safeLabel = escapeHTML(label);
  const safeColor = escapeHTML(color);
  const safePathD = escapeHTML(pathD);

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">\n' +
    '    <defs>\n' +
    '      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">\n' +
    '        <stop offset="0%" style="stop-color:' + safeColor + '22"/>\n' +
    '        <stop offset="100%" style="stop-color:' + safeColor + '44"/>\n' +
    '      </linearGradient>\n' +
    '    </defs>\n' +
    '    <rect width="400" height="300" rx="16" fill="url(#bg)" stroke="' + safeColor + '" stroke-width="2"/>\n' +
    '    <g transform="translate(160,80) scale(3.5)">\n' +
    '      <path d="' + safePathD + '" fill="' + safeColor + '" opacity="0.8"/>\n' +
    '    </g>\n' +
    '    <text x="200" y="260" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="' + safeColor + '" font-weight="bold">' + safeLabel + '</text>\n' +
    '    <text x="200" y="280" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="' + safeColor + '99">Medical Illustration</text>\n' +
    '  </svg>';
}

// Initialize Socket.IO real-time multiplayer
initializeSocket(io);

// Upload directories are initialized at startup above

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve frontend in production (Single Server Architecture)
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`\n📚 ═══════════════════════════════════════════`);
  console.log(`   SkillQuest API Server — Learn · Practice · Excel`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Socket.IO ready for real-time games`);
  console.log(`📚 ═══════════════════════════════════════════\n`);
  
  try {
    const { initializeDB } = require('./db/init');
    await initializeDB();
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
  }
});

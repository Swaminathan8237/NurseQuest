require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Routes
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quizzes');
const scoreRoutes = require('./routes/scores');
const userRoutes = require('./routes/users');
const moduleRoutes = require('./routes/modules');
const adminRoutes = require('./routes/admin');

// Socket.IO handlers
const { initializeSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5050'], methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5050'] }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload endpoint (for quiz media: images, videos, audio)
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

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

const mediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.mimetype.startsWith('video/')) {
      cb(null, './uploads/videos');
    } else if (file.mimetype.startsWith('audio/')) {
      cb(null, './uploads/audio');
    } else {
      cb(null, './uploads/images');
    }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    cb(null, uuidv4() + ext);
  }
});
const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: function (req, file, cb) {
    const allowed = /^(image|video|audio)\//;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image, video, and audio files are allowed'));
  }
});

const { authenticateToken: authUpload } = require('./middleware/auth');
app.post('/api/upload', authUpload, (req, res) => {
  mediaUpload.single('media')(req, res, function (err) {
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Build the URL relative to the server
    const filePath = req.file.path.replace(/\\/g, '/');
    const relativePath = filePath.substring(filePath.indexOf('uploads/'));
    const url = `/${relativePath}`;
    console.log(`✅ File uploaded: ${req.file.originalname} -> ${url}`);
    res.json({ url, filename: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/users', userRoutes);
app.use('/api/modules', moduleRoutes);
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
  console.log(`\n🏥 ═══════════════════════════════════════════`);
  console.log(`   NurseQuest API Server`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Socket.IO ready for real-time games`);
  console.log(`🏥 ═══════════════════════════════════════════\n`);
  
  try {
    const { initializeDB } = require('./db/init');
    await initializeDB();
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
  }
});

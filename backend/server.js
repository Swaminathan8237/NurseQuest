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

// Socket.IO handlers
const { initializeSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3000'], methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload endpoint (for quiz media: images, videos, audio)
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directories exist
const uploadDirs = ['uploads/images', 'uploads/videos', 'uploads/audio'];
const uploadsBase = path.resolve(__dirname, 'uploads');
uploadDirs.forEach(dir => {
  const fullPath = path.normalize(path.join(__dirname, dir));
  if (fullPath.startsWith(uploadsBase) && !fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`📁 Created upload directory: ${dir}`);
  }
});

const mediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let folder = 'uploads/images';
    if (file.mimetype.startsWith('video/')) folder = 'uploads/videos';
    else if (file.mimetype.startsWith('audio/')) folder = 'uploads/audio';
    cb(null, path.join(__dirname, folder));
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

  const svg = placeholders[name] || generateMedicalSVG('Medical', '#6C5CE7', 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5');
  res.type('image/svg+xml').send(svg);
});

function generateMedicalSVG(label, color, pathD) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color}22"/>
        <stop offset="100%" style="stop-color:${color}44"/>
      </linearGradient>
    </defs>
    <rect width="400" height="300" rx="16" fill="url(#bg)" stroke="${color}" stroke-width="2"/>
    <g transform="translate(160,80) scale(3.5)">
      <path d="${pathD}" fill="${color}" opacity="0.8"/>
    </g>
    <text x="200" y="260" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="${color}" font-weight="bold">${label}</text>
    <text x="200" y="280" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="${color}99">Medical Illustration</text>
  </svg>`;
}

// Initialize Socket.IO real-time multiplayer
initializeSocket(io);

// Create uploads directories
['uploads/images', 'uploads/videos', 'uploads/audio'].forEach(dir => {
  const fullPath = path.normalize(path.join(__dirname, dir));
  const uploadsBase = path.resolve(__dirname, 'uploads');
  if (fullPath.startsWith(uploadsBase) && !fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

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

# 🏥 NurseQuest — Gamified Nursing Education Platform

A full-stack gamified learning platform for nursing students, featuring interactive quizzes, real-time multiplayer sessions, XP progression, and competitive leaderboards.

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 19, Vite                    |
| Backend   | Node.js, Express 5                |
| Database  | SQLite (better-sqlite3)           |
| Real-time | Socket.IO (WebSocket)             |

## Project Structure

```
NurseQuest/
├── backend/          # Express API server + Socket.IO
│   ├── server.js     # Express setup & routes
│   ├── socket.js     # Real-time multiplayer handlers
│   ├── db/           # SQLite schema, init, seed
│   ├── middleware/    # JWT auth middleware
│   ├── routes/       # API route handlers
│   ├── utils/        # Scoring algorithms
│   └── uploads/      # User-uploaded media
├── frontend/         # React SPA (Vite)
│   └── src/
│       ├── api/       # API client
│       ├── contexts/  # Auth & Theme providers
│       ├── components/# Shared UI components
│       ├── pages/     # Route-level pages
│       └── assets/    # Static assets & Lottie
├── docs/             # Documentation & generated reports
├── scripts/          # Tooling (docx generator)
└── design/           # Stitch HTML mockups
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Install backend dependencies
cd backend
npm install

# Seed the database
npm run seed

# Install frontend dependencies
cd ../frontend
npm install
```

### Running Locally

```bash
# Terminal 1 — Start the backend
cd backend
npm run dev

# Terminal 2 — Start the frontend
cd frontend
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Production (Single Server)

```bash
cd frontend && npm run build
cd ../backend && npm start
```

The backend serves both the API and the built frontend at http://localhost:3001.

## Features

- **Role-based Access** — Teacher & Student dashboards
- **6 Question Types** — MCQ, Image, Video, Audio, Jumbled Letters, Sequence
- **Live Multiplayer** — Kahoot-style real-time quiz sessions via Socket.IO
- **XP & Leveling** — 7 nursing ranks from Nurse Intern to Chief Nurse
- **Leaderboard** — Global rankings with podium, achievements, and streaks
- **Avatar System** — Customizable character avatars
- **Dark/Light Theme** — Toggle between appearance modes

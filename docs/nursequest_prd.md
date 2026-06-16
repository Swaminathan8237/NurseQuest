# Product Requirements Document (PRD)

## 1. Product Overview

**Product Name:** NurseQuest
**Platform:** Web Application (Responsive Web App)
**Product Vision:** To revolutionize nursing education by transforming traditional, high-stakes medical assessments into an interactive, gamified, and engaging experience. NurseQuest aims to improve student retention and clinical readiness through competitive learning, real-time feedback, and dynamic visual interactions.

## 2. Target Audience

1.  **Nursing Students (Players):** 
    *   Seeking an engaging way to study complex nursing concepts, anatomy, and clinical scenarios.
    *   Motivated by progression (XP, levels), achievements (badges), and peer competition (leaderboards, live games).
2.  **Nursing Educators (Teachers/Hosts):**
    *   Looking for tools to track student performance, engagement, and weak areas.
    *   Need intuitive tools to create quizzes and host live, interactive sessions during lectures or remote classes.

## 3. Core Features & Requirements

### 3.1 Authentication & Profiles
*   **Role-Based Access:** System must support 'student' and 'teacher' roles.
*   **User Profiles:** Users must be able to customize their avatars (Avatar setup flow).
*   **Progression Tracking:** Students must have tracked XP (Experience Points), Levels, and Streaks based on their activity.

### 3.2 Student Dashboard & Experience
*   **Dashboard Analytics:** Display current XP, Level, active streak, and recent quiz attempts.
*   **Solo Play:** Students can take individual quizzes at their own pace, answering various question types (MCQ, Image, Video, Jumbled Letters).
*   **Mini-Games:** Quick, gamified challenges (e.g., 3D interactive elements, drag-and-drop scenarios) to reinforce specific medical knowledge outside of traditional quizzes.
*   **Leaderboard:** Global or cohort-based ranking of students based on XP and achievements.

### 3.3 Teacher Dashboard & Content Management
*   **Dashboard Analytics:** High-level view of total students, total quizzes, average scores, and recent attempts by the cohort.
*   **Quiz Builder:** A comprehensive tool for teachers to create, edit, and categorize quizzes. Must support defining difficulty levels, time limits, and rich media (images/video).
*   **Student Tracking:** Ability to view individual student profiles, their quiz history, and areas requiring improvement.

### 3.4 Live Multiplayer Sessions (The "Kahoot-style" Mode)
*   **Hosting:** Teachers can take an existing quiz and launch a "Live Session", generating a unique 6-digit Join Code.
*   **Joining:** Students enter the Join Code to securely enter the live room via WebSockets.
*   **Real-time Gameplay:** The teacher controls the pace of the game. Questions appear synchronously on all student screens.
*   **Live Leaderboards:** Instant feedback and rank updates after every question to drive engagement and competition.

## 4. Technical Architecture

*   **Frontend (Client):** 
    *   React.js 19 with Vite.
    *   Routing via React Router DOM.
    *   Styling via Tailwind CSS (Dark Mode optimized).
    *   Animations and Graphics: GSAP, Three.js, Lottie-web.
*   **Backend (API Server):**
    *   Node.js with Express 5.
    *   Authentication via JWT and password hashing via bcryptjs.
*   **Database:**
    *   Better-SQLite3 for high-performance, synchronous relational data storage (Tables: users, quizzes, questions, quiz_attempts, live_sessions, etc.).
*   **Real-time Communication:**
    *   Socket.io enabling full-duplex communication for live games.

## 5. Non-Functional Requirements
*   **Performance:** UI interactions must feel instant. Live game latency must be under 200ms to ensure a fair competitive environment.
*   **Responsiveness:** The UI must be fully functional on Desktop, Tablet, and Mobile browsers.
*   **Design Language:** The platform must use a "Clinical Luminary" design system—employing sleek dark modes, vibrant gradients, and glassmorphism to look premium and distinct from standard learning management systems.

## 6. Future Roadmap (V2.0 & Beyond)
*   **Live Leaderboard & Final Podium Showcase:** Real-time leaderboard updates after each question in live games, plus a showcase of top performers on an animated podium.
*   **Instructor Presentation Mode:** Split view system where instructors project questions and options onto a main screen while students use devices as answer controllers.
*   **Dedicated Modules & Admin Controls:** Dedicated navigation section for learning modules, an admin panel to manage users/content, and locked module progression (complete current to unlock next).
*   **Multi-Tenant Role Support:** Independent management of students and quiz rosters by multiple doctors/instructors.
*   Integration with external LMS platforms (Canvas, Blackboard).
*   AI-generated clinical scenarios and adaptive difficulty scaling based on student performance.
*   Advanced 3D anatomical models for interactive exploration.
*   More comprehensive mini-games simulating ER triaging and medication dosage calculations.

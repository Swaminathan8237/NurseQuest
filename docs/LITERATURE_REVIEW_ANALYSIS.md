# 📚 NurseQuest — Literature Review Analysis & Synthesis

This document provides a detailed, study-by-study analysis of the 15 primary research works included in the **NurseQuest Literature Review** (compiled from `SECOND_REVIEW_FILLED.pptx` and `references.md`). 

---

## 🌟 Executive Summary & Synthesis

The literature review for **NurseQuest** is structured to bridge the gap between **Pedagogical Effectiveness in Nursing Education** and **Modern Web System Architecture**. The reviewed literature is categorized into three key themes:
1. **Nursing Pedagogy & Gamification (Works 1–8, 13–14):** Establishing that elements like Experience Points (XP), leaderboards, digital badges, serious games, and interactive escape rooms dramatically improve knowledge retention, academic scores, and clinical decision-making.
2. **Real-Time Web Technologies (Works 9–10, 14):** Demonstrating the scalability and responsiveness of single-page application (SPA) architectures paired with WebSockets (Socket.IO) for low-latency live multiplayer synchronization.
3. **Database & Data Communication Benchmarks (Works 11–12, 15):** Evaluating SQLite for embedded read-heavy workloads, and comparing WebSockets to WebRTC to validate the performance and simplicity of event-driven synchronization.

---

## 🔍 Detailed Analysis of Individual Works

### 1. R. Nguyen (2026) — Advancing Nursing Education Through Gamification
*   **Methodology & Materials:** A review and analysis of gamification elements (e.g., XP, leaderboards, level progression) applied systematically within nursing syllabi.
*   **Datasets:** Secondary literature review aggregating findings from previous studies on gamified nursing curriculums.
*   **Results & Outcomes:** Shown that gamification elements significantly elevate student engagement, focus, and motivation in clinical learning.
*   **Relevance to NurseQuest (Advantage):** Provides the core theoretical basis for applying gamified progression (XP, levels) specifically to nursing concepts.
*   **Identified Gap (Disadvantage):** Lacks primary empirical trials and does not discuss technical implementation details or system architectures.

### 2. A. Azoulay & F. Lim (2026) — The Impact of Gamification on Academic Performance
*   **Methodology & Materials:** An integrative review of 22 peer-reviewed studies examining the direct impacts of gamification on nursing students' academic results.
*   **Datasets:** 22 study cohorts involving undergraduate nursing students in higher education settings.
*   **Results & Outcomes:** Found that gamified quiz/learning platforms improve academic exam scores by an average of **18%** compared to traditional lecturing.
*   **Relevance to NurseQuest (Advantage):** Strong empirical validation for the learning benefits of NurseQuest's core interactive quiz format.
*   **Identified Gap (Disadvantage):** The 22 reviewed studies featured highly heterogeneous gamification elements and lacked standardized metrics.

### 3. S. Aalaei et al. (2026) — Design & Evaluation of a Gamified Cardiac Rhythm App
*   **Methodology & Materials:** A quasi-experimental pre-post test study evaluating a custom serious mobile app designed to teach ECG/cardiac rhythm interpretation.
*   **Datasets:** 60 undergraduate nursing students participating in pre- and post-tests.
*   **Results & Outcomes:** Significant post-intervention improvement in ECG interpretation scores ($p < 0.001$) and high student engagement ratings.
*   **Relevance to NurseQuest (Advantage):** Highlights the need for domain-specific, visual question formats (such as image-based and audio-based quizzes in NurseQuest).
*   **Identified Gap (Disadvantage):** Mobile-only application tested in a single institution; lacked real-time multiplayer or browser-based access.

### 4. M. AlMekkawi et al. (2026) — Game-Based Learning in Undergraduate Nursing Education
*   **Methodology & Materials:** Systematic review and meta-analysis of 18 randomized controlled trials (RCTs) and quasi-experimental studies.
*   **Datasets:** Aggregated data from 18 global studies representing over 1,200 undergraduate nursing students.
*   **Results & Outcomes:** Demonstrated a statistically significant positive effect of game-based learning on knowledge retention (Standardized Mean Difference, $\text{SMD} = 0.72$) and clinical reasoning.
*   **Relevance to NurseQuest (Advantage):** High-level statistical proof validating that game-based mechanics enhance clinical decision-making.
*   **Identified Gap (Disadvantage):** Most games evaluated were single-player desktop programs that lacked real-time collaborative or competitive multiplayer.

### 5. V. I. Bahar et al. (2026) — Serious Games for Palliative Care Awareness
*   **Methodology & Materials:** A descriptive, cross-sectional study evaluating the impact of a specialized serious game on palliative care awareness.
*   **Datasets:** 85 third-year nursing students from a Turkish university who interacted with the game over 2 weeks.
*   **Results & Outcomes:** Statistically significant increase in palliative care awareness scores ($p < 0.05$) and self-reported empathy levels.
*   **Relevance to NurseQuest (Advantage):** Demonstrates that gamification works effectively for specialized clinical domains, supporting NurseQuest's modular, category-based approach.
*   **Identified Gap (Disadvantage):** Limited to a single topic (palliative care) without leaderboards, progression tracks, or multiplayer capabilities.

### 6. K. McMillan et al. (2026) — Gamification Design & Engagement in Preregistration Nurse Education
*   **Methodology & Materials:** Scoping review protocol following Joanna Briggs Institute (JBI) methodology to map gamification design features.
*   **Datasets:** Scoping protocol mapping queries across CINAHL, MEDLINE, PsycINFO, and Embase (no primary dataset).
*   **Results & Outcomes:** Defined feedback loops, structured narratives, and leaderboards as the three key motivators for nurse learners.
*   **Relevance to NurseQuest (Advantage):** Guided the architectural design of NurseQuest's real-time leaderboards and badge systems.
*   **Identified Gap (Disadvantage):** Being a scoping review protocol, it did not contain primary empirical data or system implementation code.

### 7. N. Aktaş & Y. Sazak (2025) — Escape Room-Based Strategy for Pharmacology
*   **Methodology & Materials:** Quasi-experimental trial using a physical/scenario-based escape room challenge for nursing pharmacology.
*   **Datasets:** 48 nursing students split into an intervention group ($n=24$) and a control group ($n=24$) over a semester.
*   **Results & Outcomes:** The escape room group scored significantly higher on post-intervention tests ($p < 0.01$) and reported high learning satisfaction.
*   **Relevance to NurseQuest (Advantage):** Supports the incorporation of puzzle-like interactive question formats (e.g., Jumbled Letters and Sequence ordering).
*   **Identified Gap (Disadvantage):** Purely physical format; did not scale digitally, lacked online multiplayer, and required physical setups.

### 8. M. White & T. Shellenbarger (2018) — Gamification of Nursing Education with Digital Badges
*   **Methodology & Materials:** A descriptive study evaluating the integration of digital badges as extrinsic motivators within nursing courses.
*   **Datasets:** Cohorts of undergraduate nursing students tracked across 3 consecutive academic semesters.
*   **Results & Outcomes:** Earning digital badges correlated directly with higher assignment completion rates and sustained semester-long engagement.
*   **Relevance to NurseQuest (Advantage):** Validates the implementation of achievements and digital badges in NurseQuest to encourage repetitive practice.
*   **Identified Gap (Disadvantage):** Conducted on older LMS tech; lacked modern real-time WebSockets, leaderboards, or mobile-first layouts.

### 9. S. Mishra et al. (2026) — QuestMitra: A Scalable Multiplayer Gamified Quiz Platform
*   **Methodology & Materials:** System design and load-testing of a multiplayer quiz server built on Next.js, Node.js, and Socket.IO.
*   **Datasets:** Simulated load testing scaling up to 500 concurrent WebSocket users.
*   **Results & Outcomes:** Achieved stable real-time synchronization with sub-100ms message round-trip latencies under peak load.
*   **Relevance to NurseQuest (Advantage):** Technical validation for using Socket.IO to power NurseQuest's live multiplayer lobby system.
*   **Identified Gap (Disadvantage):** Lacks domain-specific content, role-based educator tools (quiz creation), or a structured progression system.

### 10. A. Kumar et al. (2025) — Real-Time Gamified Quiz Application using React & Socket.IO
*   **Methodology & Materials:** Full-stack development study presenting a gamified quiz framework using React 18, Node.js/Express, and Socket.IO.
*   **Datasets:** Functional developer testing with 50 concurrent browser clients.
*   **Results & Outcomes:** Proved smooth state sync across multiple clients, live leaderboard updates, and responsive rendering on mobile and desktop.
*   **Relevance to NurseQuest (Advantage):** Acts as a technical blueprint for the Node-Express-React stack used in NurseQuest.
*   **Identified Gap (Disadvantage):** General-purpose quiz application with no nursing clinical logic, role authorization, or database persistence benchmarks.

### 11. J. Silva & M. Santos (2023) — Comparing SQLite and Embedded Databases for LMS
*   **Methodology & Materials:** Comparative database benchmarking of SQLite, PostgreSQL, and MySQL under simulated Learning Management System workloads.
*   **Datasets:** Synthetic workloads executing 100,000 read/write operations.
*   **Results & Outcomes:** SQLite outperformed client-server databases in read-heavy, single-server workloads due to zero network overhead.
*   **Relevance to NurseQuest (Advantage):** Justifies the selection of SQLite (via `better-sqlite3`) as the lightweight relational database for NurseQuest.
*   **Identified Gap (Disadvantage):** SQLite is not designed for distributed multi-server replication or high-concurrency write-heavy platforms.

### 12. L. Chen & X. Wang (2024) — Full-Duplex Communication: WebSockets vs. WebRTC
*   **Methodology & Materials:** Network performance comparison measuring average latency, jitter, and packet loss in browser-based multiplayer environments.
*   **Datasets:** Simulated multiplayer gameplay sessions involving 200 concurrent players.
*   **Results & Outcomes:** Socket.IO (WebSockets) offered simpler state management and lower message overhead compared to peer-to-peer WebRTC.
*   **Relevance to NurseQuest (Advantage):** Validates the choice of WebSockets (Socket.IO) over WebRTC for synchronized quiz delivery.
*   **Identified Gap (Disadvantage):** WebSockets require centralized servers, which could form bottlenecks if scaling to tens of thousands of concurrent users.

### 13. M. Yang et al. (2026) — Escape Rooms in Chinese Nursing Education
*   **Methodology & Materials:** Systematic review and meta-analysis of interactive escape room learning models within Chinese nursing schools.
*   **Datasets:** Aggregated data from 12 studies representing over 850 nursing students across clinical specialties.
*   **Results & Outcomes:** Found that escape room learning led to significantly higher clinical reasoning scores ($\text{SMD} = 0.61$) compared to traditional didactic lectures.
*   **Relevance to NurseQuest (Advantage):** Validates interactive, time-pressured scenario challenges for clinical decision-making.
*   **Identified Gap (Disadvantage):** Geographically limited studies focused on physical classrooms; lacked a digital, scalable equivalent.

### 14. Y. G. S. Barbalho et al. (2025) — Serious Game (Health Unit in Focus) Usability & Validation
*   **Methodology & Materials:** Iterative development, expert panel validation, and student usability testing of a nursing serious game.
*   **Datasets:** Expert panel of 12 nursing educators + 40 undergraduate students.
*   **Results & Outcomes:** Achieved a high Content Validity Index ($\text{CVI} = 0.92$) and high usability scores, with marked knowledge improvements.
*   **Relevance to NurseQuest (Advantage):** Provides a robust validation methodology that NurseQuest can utilize for academic review.
*   **Identified Gap (Disadvantage):** Did not assess long-term learning retention or multi-session engagement rates.

### 15. D. Jones & R. Smith (2022) — React-Based SPAs for Medical Training
*   **Methodology & Materials:** Case study and usability assessment of a custom React single-page application for clinical training.
*   **Datasets:** 120 medical/nursing students tested over an 8-week period.
*   **Results & Outcomes:** The React SPA achieved an average System Usability Scale (SUS) score of **82.5**, showing marked user satisfaction.
*   **Relevance to NurseQuest (Advantage):** Validates the use of single-page application architectures (React) to deliver responsive clinical training tools.
*   **Identified Gap (Disadvantage):** Used older React 16 features and lacked real-time websocket components, scoring systems, or progression mechanics.

---

## 🛠️ Summary of Literature Gaps and the NurseQuest Solution

The synthesis of these 15 works highlights a clear gap in existing educational tools:

| 🔍 Literature Finding / Gap | 💡 NurseQuest's Integrated Solution |
| :--- | :--- |
| **Physical Limitations:** Highly effective escape rooms (Aktaş 2025, Yang 2026) are bound to physical classrooms and do not scale. | **Digital Escape Room:** Implements interactive **Sequence ordering** and **Jumbled Letters** question formats digitally, accessible from any browser. |
| **Lack of Nursing Context:** Scalable quiz platforms (Mishra 2026, Kumar 2025) use generic trivia and lack nursing clinical scenarios. | **Nursing Domain Modules:** Categorized modules specifically tailored to nursing specialties (Anatomy, Pharmacology, Clinical Skills) with media-rich ECG and clinical audio/visual questions. |
| **No Progression System:** Effective pedagogical gamification (Nguyen 2026, White 2018) is often studied statically or implemented on rigid LMS platforms. | **Unified Gamification Engine:** Built-in XP, leveling progression, streak counters, and real-time leaderboards directly integrated with WebSockets. |
| **Scaling & Local Deployments:** Heavy server setups (Moodle) are expensive for universities. | **Lightweight Full-Stack:** React + Express + SQLite setup runs seamlessly on local systems or single-server cloud deployments. |

const API_BASE = '/api';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: { ...getHeaders(), ...options.headers },
  });
  
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
  }
  
  if (!res.ok) {
    // Carry the status and the parsed body onto the Error. Callers that only read `.message`
    // are unaffected; the ones that need more — the 409 duplicate-registration path, which
    // names the offending field so a form can hang the message off it — read `.status`/`.data`
    // instead of pattern-matching the message text.
    const err = new Error(data.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  
  return data;
}

// Auth
export const authAPI = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  setCookie: (token) => request('/auth/set-cookie', { method: 'POST', body: JSON.stringify({ token }) }),
  syncProfile: (data) => request('/auth/sync-profile', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: () => request('/auth/me'),
  updateAvatar: (avatarConfig) => request('/auth/avatar', { method: 'PUT', body: JSON.stringify({ avatarConfig }) }),
  updatePreferences: (prefs) => request('/auth/preferences', { method: 'PUT', body: JSON.stringify({ prefs }) }),
  googleLogin: (credential) => request('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  // One shared write path for every profile-completion flow: a brand-new Google user, a new
  // Supabase user, and an existing student caught by ProfileCompletionGate. The server takes the
  // user id from the verified cookie, never from this body.
  completeProfile: (data) => request('/auth/complete-profile', { method: 'POST', body: JSON.stringify(data) }),
};

// Quizzes
export const quizAPI = {
  getAll: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/quizzes${query ? '?' + query : ''}`);
  },
  getMyQuizzes: () => request('/quizzes/my-quizzes'),
  // Quizzes this user may host a live game from. Wider than getMyQuizzes for an admin, who
  // can host any quiz — including the unit quizzes the Admin dashboard offers a Live button on.
  getHostableQuizzes: () => request('/quizzes/hostable'),
  getById: (id) => request(`/quizzes/${id}`),
  // Teacher/admin editing path — returns the full quiz WITH the answer key.
  // Ownership-gated server-side; students must never call this.
  getByIdForEdit: (id) => request(`/quizzes/${id}/edit`),
  create: (data) => request('/quizzes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/quizzes/${id}`, { method: 'DELETE' }),
  // Throwaway copy hosted for a single live game, so last-minute edits made from the
  // Live flow never touch the original quiz. Deleted server-side once the game ends.
  createLiveClone: (id) => request(`/quizzes/${id}/live-clone`, { method: 'POST' }),
  importFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/quizzes/import`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error("Failed to parse JSON:", text);
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    }
    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data;
  },
  confirmImport: (data) => request('/quizzes/import/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  exportQuiz: async (id, format = 'docx') => {
    const res = await fetch(`${API_BASE}/quizzes/${id}/export?format=${format}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      const text = await res.text();
      let errorMsg = 'Export failed';
      try {
        const data = JSON.parse(text);
        errorMsg = data.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }
    const blob = await res.blob();
    const contentDisposition = res.headers.get('Content-Disposition');
    let filename = `quiz-export.${format === 'json' ? 'json' : format === 'zip' ? 'zip' : 'docx'}`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
      if (filenameMatch) filename = filenameMatch[1];
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  uploadMedia: async (file) => {
    const formData = new FormData();
    formData.append('media', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
};

// Scores
export const scoreAPI = {
  submit: (quizId, answers) => request('/scores/submit', { method: 'POST', body: JSON.stringify({ quizId, answers }) }),
  // Grade a single question server-side and reveal its key AFTER the student commits.
  // This is how the answer/explanation reach the client — never in the initial quiz payload.
  check: (quizId, questionId, answer, timeRemaining) =>
    request('/scores/check', { method: 'POST', body: JSON.stringify({ quizId, questionId, answer, timeRemaining }) }),
  getLeaderboard: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/scores/leaderboard${query ? '?' + query : ''}`);
  },
  getHistory: () => request('/scores/history'),
  getAnalytics: (quizId) => request(`/scores/analytics/${quizId}`),
};

// Users
export const userAPI = {
  getStudents: () => request('/users/students'),
  getStudent: (id) => request(`/users/students/${id}`),
  getDashboardStats: () => request('/users/dashboard-stats'),
};

// Admin & Request Workflow
export const adminAPI = {
  getUsers: () => request('/admin/users'),
  updateUserRole: (id, role) => request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  // Partial update — only the keys present in `data` are touched. The server validates the
  // MERGED row, so sending just a registration number is fine for a student who already has a
  // university stored. Rejects a duplicate registration number with a readable 409.
  updateUserProfile: (id, data) => request(`/admin/users/${id}/profile`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  submitQuizRequest: (quizId, unit) => request('/admin/requests', { method: 'POST', body: JSON.stringify({ quizId, unit }) }),
  getMyQuizRequests: () => request('/admin/my-requests'),
  getAllQuizRequests: () => request('/admin/requests'),
  processQuizRequest: (id, action, adminNotes, unit) => request(`/admin/requests/${id}/action`, { method: 'POST', body: JSON.stringify({ action, adminNotes, unit }) }),
  getStats: () => request('/admin/stats'),
  resetStatistics: () => request('/admin/reset-statistics', { method: 'POST' }),
  // Student analytics
  getStudentUnits: (id) => request(`/admin/students/${id}/units`),
  getStudentUnitAttempts: (id, unit) => request(`/admin/students/${id}/units/${unit}/attempts`),
  getAttemptQuestions: (attemptId) => request(`/admin/attempts/${attemptId}/questions`),
  // Full performance report: accuracy, first-attempt mastery, cognitive/time metrics,
  // retention, Knowledge Score + classification, and badges. `expectedMinutes` optionally
  // overrides the per-unit time budget used by the Speed Score.
  getStudentReport: (id, expectedMinutes) => request(`/admin/students/${id}/report${expectedMinutes ? `?expectedMinutes=${expectedMinutes}` : ''}`),
  // Live game analytics
  getStudentLiveGames: (id) => request(`/admin/students/${id}/live-games`),
  getLiveGameDetail: (attemptId) => request(`/admin/live-games/${attemptId}/detail`),
  getStudentLiveReport: (id, expectedMinutes) => {
    const qs = expectedMinutes ? `?expectedMinutes=${encodeURIComponent(expectedMinutes)}` : '';
    return request(`/admin/students/${id}/live-report${qs}`);
  },
  // Unit quiz & access management
  getUnitQuizzes: () => request('/admin/unit-quizzes'),
  getUnitAccess: () => request('/admin/units/access'),
  updateUnitAccess: (unit, data) => request(`/admin/units/${unit}/access`, { method: 'POST', body: JSON.stringify(data) }),
  // Classes & sections. Grouped by (university, class_section) — the same label at two
  // universities is two different classes, so both are always carried together.
  getClasses: () => request('/admin/classes'),
  mergeClasses: ({ university, from, to }) =>
    request('/admin/classes/merge', { method: 'POST', body: JSON.stringify({ university, from, to }) }),
  // Telegram-style 5s pending deletion undo
  initiatePendingDeletion: ({ entityType, entityId }) => request('/admin/pending-deletions', { method: 'POST', body: JSON.stringify({ entityType, entityId }) }),
  undoPendingDeletion: (id) => request(`/admin/pending-deletions/${id}/undo`, { method: 'POST' }),
  commitPendingDeletion: (id) => request(`/admin/pending-deletions/${id}/commit`, { method: 'POST' }),
  getPendingDeletions: () => request('/admin/pending-deletions'),
};

export default { authAPI, quizAPI, scoreAPI, userAPI, adminAPI };

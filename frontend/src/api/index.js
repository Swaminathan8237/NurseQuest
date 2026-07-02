const API_BASE = '/api';

function getToken() {
  return sessionStorage.getItem('nursequest_token');
}

function getHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
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
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  
  return data;
}

// Auth
export const authAPI = {
  syncProfile: (data) => request('/auth/sync-profile', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: () => request('/auth/me'),
  updateAvatar: (avatarConfig) => request('/auth/avatar', { method: 'PUT', body: JSON.stringify({ avatarConfig }) }),
};

// Quizzes
export const quizAPI = {
  getAll: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/quizzes${query ? '?' + query : ''}`);
  },
  getMyQuizzes: () => request('/quizzes/my-quizzes'),
  getById: (id) => request(`/quizzes/${id}`),
  create: (data) => request('/quizzes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/quizzes/${id}`, { method: 'DELETE' }),
  importFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/quizzes/import`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
    const token = getToken();
    const res = await fetch(`${API_BASE}/quizzes/${id}/export?format=${format}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
    const token = getToken();
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

// Modules
export const moduleAPI = {
  getAll: () => request('/modules'),
  getById: (id) => request(`/modules/${id}`),
  create: (data) => request('/modules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/modules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/modules/${id}`, { method: 'DELETE' }),
};

// Admin & Request Workflow
export const adminAPI = {
  getUsers: () => request('/admin/users'),
  updateUserRole: (id, role) => request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  getModules: () => request('/admin/modules'),
  submitQuizRequest: (quizId, moduleId) => request('/admin/requests', { method: 'POST', body: JSON.stringify({ quizId, moduleId }) }),
  getMyQuizRequests: () => request('/admin/my-requests'),
  getAllQuizRequests: () => request('/admin/requests'),
  processQuizRequest: (id, action, adminNotes) => request(`/admin/requests/${id}/action`, { method: 'POST', body: JSON.stringify({ action, adminNotes }) }),
  getStats: () => request('/admin/stats'),
  resetStatistics: () => request('/admin/reset-statistics', { method: 'POST' }),
};

export default { authAPI, quizAPI, scoreAPI, userAPI, moduleAPI, adminAPI };

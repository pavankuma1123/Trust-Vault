import { User, Document, AccessGrant, AuditLog, LedgerVerification, TelemetryOverview } from '../types';

const API_BASE = '/api/v1';

function getHeaders(isFormData = false): HeadersInit {
  const token = localStorage.getItem('trustvault_token');
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export const api = {
  // Auth
  async register(name: string, email: string, password: string): Promise<{ access_token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role: 'OWNER' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('trustvault_token', data.access_token);
    return data;
  },

  async login(email: string, password: string): Promise<{ access_token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Authentication failed' }));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('trustvault_token', data.access_token);
    return data;
  },

  async resetPassword(email: string, new_password: string): Promise<{ access_token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, new_password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Password reset failed' }));
      throw new Error(err.detail || 'Password reset failed');
    }
    const data = await res.json();
    localStorage.setItem('trustvault_token', data.access_token);
    return data;
  },

  async getMe(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch user profile');
    return res.json();
  },

  logout() {
    localStorage.removeItem('trustvault_token');
  },

  // Documents
  async listDocuments(query?: { title?: string; category?: string }): Promise<Document[]> {
    const params = new URLSearchParams();
    if (query?.title) params.append('title', query.title);
    if (query?.category) params.append('category', query.category);
    
    const url = `${API_BASE}/documents${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch documents');
    return res.json();
  },

  async uploadDocument(file: File, title: string, category: string): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('category', category);

    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload refused' }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  async downloadDocument(docId: string, filename: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/${docId}/download`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Access refused (404/403)' }));
      throw new Error(err.detail || 'Download forbidden or document not found');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async deleteDocument(docId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/${docId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Deletion refused' }));
      throw new Error(err.detail || 'Delete failed');
    }
  },

  // Access Grants
  async listGrants(docId: string): Promise<AccessGrant[]> {
    const res = await fetch(`${API_BASE}/documents/${docId}/grants`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to list grants');
    return res.json();
  },

  async createGrant(docId: string, payload: {
    grantee_email: string;
    permission: 'READ' | 'EDIT';
    max_downloads?: number | null;
    expires_at?: string | null;
  }): Promise<AccessGrant> {
    const res = await fetch(`${API_BASE}/documents/${docId}/grants`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Grant failed' }));
      throw new Error(err.detail || 'Failed to grant access');
    }
    return res.json();
  },

  async revokeGrant(docId: string, grantId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/${docId}/grants/${grantId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Revocation failed' }));
      throw new Error(err.detail || 'Failed to revoke access');
    }
  },

  // Audit & Telemetry
  async getAuditLedger(limit = 100): Promise<AuditLog[]> {
    const res = await fetch(`${API_BASE}/audit/ledger?limit=${limit}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch audit ledger');
    return res.json();
  },

  async verifyLedger(): Promise<LedgerVerification> {
    const res = await fetch(`${API_BASE}/audit/verify`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Ledger verification failed');
    return res.json();
  },

  async getTelemetryOverview(): Promise<TelemetryOverview> {
    const res = await fetch(`${API_BASE}/telemetry/overview`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch telemetry data');
    return res.json();
  }
};

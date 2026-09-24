/**
 * Centralized API & Auth Client for NEMO Studio.
 * Automatically scopes all network requests by the active Firebase/logged-in user UID,
 * ensuring complete data isolation between accounts.
 */

export interface CachedNemoUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  provider?: string;
  role?: 'admin' | 'normal';
}

export const ADMIN_EMAIL = 'gobi56529@gmail.com';

export function isUserAdmin(): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  return user.role === 'admin' || user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export function getCurrentUser(): CachedNemoUser | null {
  try {
    const raw = localStorage.getItem('nemo_user');
    if (!raw) return null;
    const user = JSON.parse(raw) as CachedNemoUser;
    if (user && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      user.role = 'admin';
    } else if (user && !user.role) {
      user.role = 'normal';
    }
    return user;
  } catch {
    return null;
  }
}

export function getCurrentUserId(): string {
  const user = getCurrentUser();
  if (user?.uid) {
    return user.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  }
  if (user?.email) {
    return user.email.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  }
  return 'default';
}

export function getUserEmail(): string {
  const user = getCurrentUser();
  return user?.email || '';
}

export function getUserDisplayName(): string {
  const user = getCurrentUser();
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email.split('@')[0];
  return 'Operator';
}

export function getAuthHeaders(): Record<string, string> {
  const user = getCurrentUser();
  return {
    'x-user-id': getCurrentUserId(),
    'x-user-email': user?.email || '',
  };
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * Builds an API URL that automatically attaches `userId` and `userEmail` as query parameters
 * (ensures SSE EventSource, media URLs, and standard fetches are user-scoped).
 */
export function apiPath(path: string, params?: Record<string, string>): string {
  const uid = getCurrentUserId();
  const email = getUserEmail();
  const sep = path.includes('?') ? '&' : '?';
  let url = `${apiBaseUrl}${path}${sep}userId=${encodeURIComponent(uid)}`;
  if (email) {
    url += `&userEmail=${encodeURIComponent(email)}`;
  }
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
    }
  }
  return url;
}

/**
 * Enhanced fetch wrapper that attaches x-user-id and x-user-email headers.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  return fetch(apiPath(path), {
    ...options,
    headers,
  });
}

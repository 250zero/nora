import { HttpInterceptorFn } from '@angular/common/http';

const AUTH_TOKEN_KEY = 'nora_auth_token_v1';
const AUTH_USER_KEY = 'nora_auth_user_v1';

export const jwtAuthInterceptor: HttpInterceptorFn = (req, next) => {
  let token: string | null = null;
  let role = '1';
  let userId: string | null = null;

  if (typeof localStorage !== 'undefined') {
    token = localStorage.getItem(AUTH_TOKEN_KEY);
    try {
      const rawUser = localStorage.getItem(AUTH_USER_KEY);
      if (rawUser) {
        const u = JSON.parse(rawUser);
        role = String(u.role || 1);
        userId = u.id || null;
      }
    } catch {}
  }

  let headers = req.headers.set('X-Active-Role', role);

  if (userId) {
    headers = headers.set('X-User-Id', userId);
  }

  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const clonedReq = req.clone({ headers });
  return next(clonedReq);
};

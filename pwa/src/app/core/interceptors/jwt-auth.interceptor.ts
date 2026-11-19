import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const jwtAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();
  const currentRole = authService.currentUser()?.role || 1;

  let headers = req.headers.set('X-Active-Role', String(currentRole));

  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const clonedReq = req.clone({ headers });
  return next(clonedReq);
};

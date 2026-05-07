import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Usuario } from '../interfaces/Usuario';
import { Observable, tap, throwError, BehaviorSubject, switchMap, map, catchError, of, finalize, shareReplay } from 'rxjs';
import { ResponseAcceso } from '../interfaces/ResponseAcceso';
import { Login } from '../interfaces/Login';
import { UsuarioEdit } from '../interfaces/UsuarioEdit';
import { clearAccessToken, getAccessToken, setAccessToken } from './access-token.store';

export interface UsersQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  active?: boolean;
}

export interface PaginatedUsersResponse {
  data: Usuario[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  queryRequired?: boolean;
  message?: string;
}

export interface AccountClaimInfo {
  valid: boolean;
  email?: string;
  firstname?: string;
  lastname?: string;
  expiresAt?: string;
  message?: string;
}


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient)
  private urlBase: string = environment.apiUrl + "/user/"

  private currentUserSubject = new BehaviorSubject<any>(null);
  private restoreSession$?: Observable<any>;
  public currentUser$ = this.currentUserSubject.asObservable();

  get currentUserValue(): any {
    return this.currentUserSubject.value;
  }

  constructor() {
    if (this.hasBrowserStorage()) {
      this.ensureCurrentUser().subscribe({ error: () => { } });
    }
  }

  private hasBrowserStorage(): boolean {
    return typeof window !== 'undefined' && !!window.localStorage;
  }

  private getAccessToken(): string | null {
    return getAccessToken();
  }

  private setAccessToken(token: string): void {
    setAccessToken(token);
  }

  storeAccessToken(token: string): void {
    this.setAccessToken(token);
  }

  private clearStoredSession(): void {
    clearAccessToken();
    if (this.hasBrowserStorage()) {
      window.localStorage.removeItem('cachedProfile');
    }
  }

  registrarse(objeto: Usuario) {
    return this.http.post(`${this.urlBase}register`, objeto)
  }

  login(objeto: Login): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}login`, objeto, { withCredentials: true }).pipe(
      tap((resp) => {
        if (resp?.token) {
          this.setAccessToken(resp.token);
        }
      }),
      switchMap((resp) => this.getProfile().pipe(
        map(() => resp)
      ))
    );
  }

  loginWithGoogle(credential: string): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}google`, { credential }, { withCredentials: true }).pipe(
      tap((resp) => {
        if (resp?.token) {
          this.setAccessToken(resp.token);
        }
      }),
      switchMap((resp) => this.getProfile().pipe(
        map(() => resp)
      ))
    );
  }

  requestAccountClaim(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.urlBase}claim/request`, { email });
  }

  validateAccountClaim(token: string): Observable<AccountClaimInfo> {
    return this.http.get<AccountClaimInfo>(`${this.urlBase}claim/validate`, {
      params: new HttpParams().set('token', token)
    });
  }

  completeAccountClaim(token: string, password: string): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}claim/complete`, { token, password }, { withCredentials: true }).pipe(
      tap((resp) => {
        if (resp?.token) {
          this.setAccessToken(resp.token);
        }
      }),
      switchMap((resp) => this.getProfile().pipe(
        map(() => resp)
      ))
    );
  }

  getProfile(): Observable<any> {
    return this.http.get(`${this.urlBase}profile`).pipe(
      tap(profile => {
        this.currentUserSubject.next(profile);
      }),
      catchError(err => {
        if (err?.status === 401 || err?.status === 403) {
          this.logout();
        }
        return throwError(() => err);
      })
    );
  }

  refreshToken(): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}refresh`, {}, { withCredentials: true }).pipe(
      tap((resp) => {
        if (resp?.token) {
          this.setAccessToken(resp.token);
        }
      })
    );
  }

  ensureCurrentUser(): Observable<any> {
    if (this.currentUserSubject.value) {
      return of(this.currentUserSubject.value);
    }

    if (!this.hasBrowserStorage()) {
      return of(null);
    }

    if (!this.restoreSession$) {
      const loadSession$ = this.getAccessToken()
        ? this.getProfile()
        : this.refreshToken().pipe(switchMap(() => this.getProfile()));

      this.restoreSession$ = loadSession$.pipe(
        catchError(() => of(null)),
        finalize(() => {
          this.restoreSession$ = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this.restoreSession$;
  }

  obtenerImagenUsuario(id: number): Observable<UsuarioEdit> {
    return this.http.get<UsuarioEdit>(`${this.urlBase}/${id}`);
  }

  update(objeto: UsuarioEdit): Observable<UsuarioEdit> {
    return this.http.put<UsuarioEdit>(`${this.urlBase}profile/${objeto.id}`, objeto);

  }

  getUserById(id: number): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.urlBase}${id}`);
  }

  getUsers(params?: UsersQueryParams): Observable<PaginatedUsersResponse> {
    let httpParams = new HttpParams();

    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    if (params?.search?.trim()) httpParams = httpParams.set('search', params.search.trim());
    if (params?.role?.trim()) httpParams = httpParams.set('role', params.role.trim());
    if (typeof params?.active === 'boolean') httpParams = httpParams.set('active', String(params.active));

    return this.http.get<PaginatedUsersResponse>(`${this.urlBase}`, {
      params: httpParams
    }).pipe(
      map((response: any) => ({
        data: response.data || [],
        total: response.total || 0,
        page: response.page || params?.page || 1,
        limit: response.limit || params?.limit || 20,
        totalPages: response.totalPages || 1,
        queryRequired: response.queryRequired,
        message: response.message
      }))
    );
  }

  delete(id: number) {
    return this.http.delete(`${this.urlBase}${id}`)
  }

  updateRole(id: number, roles: string[], action: 'set' | 'add' | 'remove' = 'set') {
    return this.http.put(`${this.urlBase}${id}/role`, { roles, action });
  }

  logout() {
    this.http.post(`${this.urlBase}logout`, {}, { withCredentials: true }).subscribe({
      error: () => { }
    });
    this.currentUserSubject.next(null);
    this.clearStoredSession();
  }
}

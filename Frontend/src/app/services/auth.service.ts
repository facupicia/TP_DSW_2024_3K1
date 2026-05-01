import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Usuario } from '../interfaces/Usuario';
import { Observable, tap, throwError, BehaviorSubject, switchMap, map, catchError, of } from 'rxjs';
import { ResponseAcceso } from '../interfaces/ResponseAcceso';
import { Login } from '../interfaces/Login';
import { UsuarioEdit } from '../interfaces/UsuarioEdit';

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

  private currentUserSubject = new BehaviorSubject<any>(null); // Inicializa con null o datos de localStorage si persistes sesión
  public currentUser$ = this.currentUserSubject.asObservable();

  get currentUserValue(): any {
    return this.currentUserSubject.value;
  }

  constructor() {
    // Opcional: Recuperar sesión al recargar
    if (typeof window !== 'undefined' && localStorage.getItem('token')) {
      this.getProfile().subscribe({
        error: (err) => console.error('Error restaurando sesión:', err)
      });
    } else if (typeof window !== 'undefined') {
      this.refreshToken().subscribe({
        next: () => this.getProfile().subscribe({
          error: (err) => console.error('Error restaurando perfil:', err)
        }),
        error: () => { }
      });
    }
  }

  registrarse(objeto: Usuario) {
    return this.http.post(`${this.urlBase}register`, objeto)
  }

  login(objeto: Login): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}login`, objeto, { withCredentials: true }).pipe(
      tap((resp) => {
        if (resp?.token && typeof window !== 'undefined') {
          localStorage.setItem('token', resp.token);
        }
      }),
      // Encadenamos la obtención del perfil para asegurar que el estado esté actualizado antes de completar
      switchMap((resp) => this.getProfile().pipe(
        map(() => resp)
      ))
    );
  }

  loginWithGoogle(credential: string): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}google`, { credential }, { withCredentials: true }).pipe(
      tap((resp) => {
        if (resp?.token && typeof window !== 'undefined') {
          localStorage.setItem('token', resp.token);
        }
      }),
      // Encadenamos la obtención del perfil
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
        if (resp?.token && typeof window !== 'undefined') {
          localStorage.setItem('token', resp.token);
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
        console.log('Perfil actualizado en estado global');
        this.currentUserSubject.next(profile); // Actualiza el estado reactivo
      }),
      catchError(err => {
        // Si falla el perfil por auth, limpiamos la sesión. Errores temporales no deben cerrar sesión.
        console.error('Error obteniendo perfil:', err);
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
        if (resp?.token && typeof window !== 'undefined') {
          localStorage.setItem('token', resp.token);
        }
      })
    );
  }

  ensureCurrentUser(): Observable<any> {
    if (this.currentUserSubject.value) {
      return of(this.currentUserSubject.value);
    }

    if (typeof window !== 'undefined' && localStorage.getItem('token')) {
      return this.getProfile();
    }

    return of(null);
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
    console.log('Cerrando sesión...');
    this.http.post(`${this.urlBase}logout`, {}, { withCredentials: true }).subscribe({
      error: () => { }
    });
    this.currentUserSubject.next(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('cachedProfile');
    }
  }
}

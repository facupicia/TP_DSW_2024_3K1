import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Usuario } from '../interfaces/Usuario';
import { Observable, tap, throwError, BehaviorSubject, switchMap, map, catchError } from 'rxjs';
import { ResponseAcceso } from '../interfaces/ResponseAcceso';
import { Login } from '../interfaces/Login';
import { UsuarioEdit } from '../interfaces/UsuarioEdit';



@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient)
  private urlBase: string = environment.apiUrl + "/user/"

  private currentUserSubject = new BehaviorSubject<any>(null); // Inicializa con null o datos de localStorage si persistes sesión
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    // Opcional: Recuperar sesión al recargar
    if (typeof window !== 'undefined' && localStorage.getItem('token')) {
      this.getProfile().subscribe({
        error: (err) => console.error('Error restaurando sesión:', err)
      });
    }
  }

  registrarse(objeto: Usuario) {
    return this.http.post(`${this.urlBase}register`, objeto)
  }

  login(objeto: Login): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}login`, objeto).pipe(
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
    return this.http.post<ResponseAcceso>(`${this.urlBase}google`, { credential }).pipe(
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

  getProfile(): Observable<any> {
    return this.http.get(`${this.urlBase}profile`).pipe(
      tap(profile => {
        console.log('Perfil actualizado en estado global');
        this.currentUserSubject.next(profile); // Actualiza el estado reactivo
      }),
      catchError(err => {
        // Si falla el perfil (ej. token inválido), limpiamos la sesión
        console.error('Error obteniendo perfil:', err);
        this.logout();
        return throwError(() => err);
      })
    );
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

  getUsers(): Observable<any> {
    return this.http.get(`${this.urlBase}`);
  }

  delete(id: number) {
    return this.http.delete(`${this.urlBase}${id}`)
  }

  updateRole(id: number, rol: 'user' | 'admin' | 'scanner') {
    return this.http.put(`${this.urlBase}${id}/role`, { rol });
  }

  logout() {
    console.log('Cerrando sesión...');
    this.currentUserSubject.next(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('cachedProfile');
    }
  }
}

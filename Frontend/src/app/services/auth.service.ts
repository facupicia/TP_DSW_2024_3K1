import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment.development';
import { inject, Injectable } from '@angular/core';
import { Usuario } from '../interfaces/Usuario';
import { Observable, tap, throwError, BehaviorSubject } from 'rxjs';
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
      this.getProfile().subscribe();
    }
  }

  registrarse(objeto: Usuario) {
    return this.http.post(`${this.urlBase}register`, objeto)
  }

  login(objeto: Login): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}login`, objeto).pipe(
      tap(() => {
        // Al hacer login exitoso, obtenemos el perfil para actualizar el estado
        this.getProfile().subscribe();
      })
    );
  }

  getProfile(): Observable<any> {
    return this.http.get(`${this.urlBase}profile`).pipe(
      tap(profile => {
        this.currentUserSubject.next(profile); // Actualiza el estado reactivo
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

  logout() {
    this.currentUserSubject.next(null);
  }
}

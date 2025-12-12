import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment.development';
import { inject, Injectable } from '@angular/core';
import { Usuario } from '../interfaces/Usuario';
import { Observable, tap, throwError } from 'rxjs';
import { ResponseAcceso } from '../interfaces/ResponseAcceso';
import { Login } from '../interfaces/Login';
import { UsuarioEdit } from '../interfaces/UsuarioEdit';



@Injectable({
  providedIn: 'root'
})
export class AccesService {

  private http = inject(HttpClient)
  private urlBase: string = environment.apiUrl + "/user/"
  constructor() { }

  registrarse(objeto: Usuario) {
    return this.http.post(`${this.urlBase}register`, objeto)
  }

  login(objeto: Login): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}login`, objeto)
  }

  getProfile(): Observable<any> {

    // Implementación de caching
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
      return new Observable(observer => {
        observer.next(JSON.parse(cachedProfile));
        observer.complete();
      });
    }
    return this.http.get(`${this.urlBase}profile`).pipe(
      tap(profile => {
        // Guardar en caché
        localStorage.setItem('cachedProfile', JSON.stringify(profile));
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
}

import { HttpClient, HttpHeaders } from '@angular/common/http';
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
 //ivate urlBase: string = "https://backend-eventlife.onrender.com/api/user/"
   private urlBase: string = "http://localhost:3000/api/user/"
  constructor() { }

  registrarse(objeto: Usuario) {
    return this.http.post(`${this.urlBase}register`, objeto)
  }

  login(objeto: Login): Observable<ResponseAcceso> {
    return this.http.post<ResponseAcceso>(`${this.urlBase}login`, objeto)
  }

  getProfile(token: string): Observable<any> {
    const headers = new HttpHeaders().set('token', `${token}`);
    // Implementación de caching
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
      return new Observable(observer => {
        observer.next(JSON.parse(cachedProfile));
        observer.complete();
      });
    }
    return this.http.get(`${this.urlBase}profile`, { headers }).pipe(
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
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('token', `${token}`);
    return this.http.put<UsuarioEdit>(`${this.urlBase}profile/${objeto.id}`, objeto, { headers });
  }

  getUserById(id: number): Observable<Usuario> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('token', `${token}`);
    return this.http.get<Usuario>(`${this.urlBase}${id}`, { headers });
  }

  getUsers(token: string): Observable<any> {
    if (!token) {
      console.error('Token inválido.');
      return throwError(() => new Error('Token inválido'));
    }
  
    const headers = new HttpHeaders().set('token', `${token}`);
    return this.http.get(`${this.urlBase}`, { headers });
  }

  delete(id: number) {
    return this.http.delete(`${this.urlBase}${id}`)
  }
}

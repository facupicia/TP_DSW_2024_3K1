import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Evento } from '../interfaces/event';
import { Observable, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

export class EventServiceService {

  private http = inject(HttpClient);
  //ivate urlBase: string = "https://backend-eventlife.onrender.com/api/event/";
  private urlBase: string = "http://localhost:3000/api/event/";
  constructor() { }

  crearEvento(objeto: Evento): Observable<Evento> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('token', `${token}`);

    return this.http.post<Evento>(`${this.urlBase}new`, objeto, { headers });
  }

  obtenerEventosUsuario(): Observable<Evento[]> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const token = localStorage.getItem('token');
      const headers = new HttpHeaders().set('token', `${token}`);

      return this.http.get<Evento[]>(`${this.urlBase}`, { headers })
    } else {
      return new Observable<Evento[]>();
    }
  }

  obtenerEvento(id: number): Observable<Evento> {
    return this.http.get<Evento>(`${this.urlBase}${id}`);
  }

  borrarEvento(id: number): Observable<Evento> {
    return this.http.delete<Evento>(`${this.urlBase}${id}`);
  }

  actualizarEvento(id: number, objeto: Evento): Observable<Evento> {
    return this.http.put<Evento>(`${this.urlBase}${id}`, objeto,);
  }

  searchEventsByName(searchTerm: string): Observable<any> {
    const params = new HttpParams().set('search', searchTerm);
    return this.http.get<any>(`${this.urlBase}/search`, { params });
  }

  obtenerEventos(): Observable<Evento[]> {
    return this.http.get<Evento[]>(`${this.urlBase}/explore`);
  }


}



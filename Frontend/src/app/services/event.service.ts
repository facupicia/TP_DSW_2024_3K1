import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment.development';
import { inject, Injectable } from '@angular/core';
import { Evento } from '../interfaces/event';
import { Observable, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

export class EventService {

  private http = inject(HttpClient);
  private urlBase: string = environment.apiUrl + "/event/";
  constructor() { }

  crearEvento(objeto: Evento): Observable<Evento> {
    return this.http.post<Evento>(`${this.urlBase}new`, objeto);

  }

  obtenerEventosUsuario(): Observable<Evento[]> {
    if (typeof window !== 'undefined' && window.localStorage) {
      return this.http.get<Evento[]>(`${this.urlBase}`)

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



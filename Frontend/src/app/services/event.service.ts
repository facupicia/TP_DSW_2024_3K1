import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Evento } from '../interfaces/event';
import { Observable, tap, map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

export class EventService {

  private http = inject(HttpClient);
  private urlBase: string = environment.apiUrl + "/event";
  constructor() { }

  crearEvento(objeto: Evento): Observable<Evento> {
    return this.http.post<Evento>(`${this.urlBase}/new`, objeto);

  }

  obtenerEventosUsuario(): Observable<Evento[]> {
    if (typeof window !== 'undefined' && window.localStorage) {
      return this.http.get<Evento[]>(`${this.urlBase}`).pipe(
        tap(events => events.forEach(e => {
          if (e.category && !e.categoria_name) {
            e.categoria_name = (e.category as any).name;
          }
        }))
      );
    } else {
      return new Observable<Evento[]>();
    }
  }

  obtenerEvento(id: number): Observable<Evento> {
    return this.http.get<Evento>(`${this.urlBase}/${id}`).pipe(
      tap(e => {
        if (e.category && !e.categoria_name) {
          e.categoria_name = (e.category as any).name;
        }
      })
    );
  }

  borrarEvento(id: number): Observable<Evento> {
    return this.http.delete<Evento>(`${this.urlBase}/${id}`);
  }

  actualizarEvento(id: number, objeto: Evento): Observable<Evento> {
    return this.http.put<Evento>(`${this.urlBase}/${id}`, objeto,);
  }

  searchEventsByName(searchTerm: string): Observable<any> {
    const params = new HttpParams().set('search', searchTerm);
    return this.http.get<any>(`${this.urlBase}/search`, { params }).pipe(
      tap((events: any[]) => events.forEach(e => {
        if (e.category && !e.categoria_name) {
          e.categoria_name = (e.category as any).name;
        }
      }))
    );
  }

  obtenerEventos(): Observable<Evento[]> {
    return this.http.get<Evento[]>(`${this.urlBase}/explore`).pipe(
      tap(events => events.forEach(e => {
        if (e.category && !e.categoria_name) {
          e.categoria_name = (e.category as any).name;
        }
      }))
    );
  }

  getEventsNumber(): Observable<number> {
    return this.http.get<any>(`${this.urlBase}/count`).pipe(
      map(data => data.activeEvents)
    );
  }


}



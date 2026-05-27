import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Evento } from '../interfaces/event';
import { Observable, tap, map, timeout, of, shareReplay } from 'rxjs';

const DEFAULT_EVENT_IMAGE = '/assets/event-placeholder.svg';
const EXPLORE_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

@Injectable({
  providedIn: 'root'
})

export class EventService {

  private http = inject(HttpClient);
  private urlBase: string = environment.apiUrl + "/event";
  private eventsCache = new Map<string, Observable<Evento[]>>();
  constructor() { }

  crearEvento(objeto: Evento): Observable<Evento> {
    return this.http.post<Evento>(`${this.urlBase}/new`, objeto).pipe(
      tap(() => this.clearEventsCache())
    );

  }

  obtenerEventosUsuario(): Observable<Evento[]> {
    if (typeof window === 'undefined') {
      return of([]);
    }

    return this.http.get<{ data: Evento[], total: number }>(`${this.urlBase}/my-events`).pipe(
      map(response => (response.data || []).map(e => ({
        ...e,
        categoria_name: e.categoria_name || (e.category as any)?.name
      })))
    );
  }

  obtenerEvento(id: number): Observable<Evento> {
    return this.http.get<Evento>(`${this.urlBase}/${id}`).pipe(
      timeout(10000), // 10 segundos timeout
      map(e => this.normalizeEvent(e))
    );
  }

  borrarEvento(id: number): Observable<Evento> {
    return this.http.delete<Evento>(`${this.urlBase}/${id}`).pipe(
      tap(() => this.clearEventsCache())
    );
  }

  actualizarEvento(id: number, objeto: Evento): Observable<Evento> {
    return this.http.put<Evento>(`${this.urlBase}/${id}`, objeto,).pipe(
      tap(() => this.clearEventsCache())
    );
  }

  searchEventsByName(searchTerm: string): Observable<any> {
    const params = new HttpParams().set('search', searchTerm);
    return this.http.get<any>(`${this.urlBase}/search`, { params }).pipe(
      map((events: any[]) =>
        Array.isArray(events)
          ? events.map(e => ({
              ...e,
              categoria_name: e.categoria_name || (e.category as any)?.name
            }))
          : events
      )
    );
  }

  obtenerEventos(limit = 50, page = 1, forceRefresh = false): Observable<Evento[]> {
    const cacheKey = `${page}:${limit}`;

    if (!forceRefresh && this.eventsCache.has(cacheKey)) {
      return this.eventsCache.get(cacheKey)!;
    }

    // Cache localStorage: si el usuario recarga el navegador,
    // recuperamos los eventos de localStorage si no expiraron.
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const lsKey = `eventlife_explore_${page}_${limit}`;
        const raw = window.localStorage.getItem(lsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() < parsed.expiresAt) {
            const cached$ = of(parsed.data as Evento[]).pipe(shareReplay(1));
            this.eventsCache.set(cacheKey, cached$);
            return cached$;
          }
          window.localStorage.removeItem(lsKey);
        }
      } catch {
        // ignore parse errors
      }
    }

    const params = new HttpParams()
      .set('limit', String(limit))
      .set('page', String(page));

    const request$ = this.http.get<{ data: Evento[], total: number }>(`${this.urlBase}/explore`, { params }).pipe(
      map(response => (response.data || []).map(event => this.normalizeEvent(event))),
      tap(events => {
        // Guardar en localStorage para sobrevivir recargas
        if (typeof window !== 'undefined') {
          try {
            const lsKey = `eventlife_explore_${page}_${limit}`;
            window.localStorage.setItem(lsKey, JSON.stringify({
              data: events,
              expiresAt: Date.now() + EXPLORE_CACHE_TTL
            }));
          } catch {
            // ignore storage errors (e.g. quota exceeded)
          }
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.eventsCache.set(cacheKey, request$);
    return request$;
  }

  clearEventsCache(): void {
    this.eventsCache.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key?.startsWith('eventlife_explore_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => window.localStorage.removeItem(k));
      } catch {
        // ignore
      }
    }
  }

  getEventsNumber(): Observable<number> {
    return this.http.get<any>(`${this.urlBase}/count`).pipe(
      map(data => data.activeEvents)
    );
  }

  private normalizeEvent(event: Evento): Evento {
    return {
      ...event,
      title: this.normalizeTitle(event.title),
      image: this.normalizeImageUrl(event.image),
      categoria_name: event.categoria_name || event.category?.name || 'Evento'
    };
  }

  private normalizeTitle(title?: string): string {
    return (title || 'Evento').replace(/^\[LOAD\]\s*/i, '').trim();
  }

  private normalizeImageUrl(image?: string | null): string {
    const value = image?.trim();

    if (!value) {
      return DEFAULT_EVENT_IMAGE;
    }

    if (/^https?:\/\//i.test(value) || value.startsWith('data:image/')) {
      return value;
    }

    return DEFAULT_EVENT_IMAGE;
  }

}



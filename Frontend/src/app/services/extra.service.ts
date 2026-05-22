import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EventProduct, ExtraItem } from '../interfaces/product';

@Injectable({
    providedIn: 'root'
})
export class ExtraService {

    private http = inject(HttpClient);
    private urlBase: string = environment.apiUrl + "/extra";

    getEventExtras(eventId: number): Observable<EventProduct[]> {
        return this.http.get<EventProduct[]>(`${this.urlBase}/event/${eventId}`);
    }

    addExtraToEvent(eventId: number, extra: { productId: number; eventPrice: number; hasStock?: boolean; stock?: number; maxPerOrder?: number }): Observable<EventProduct> {
        return this.http.post<EventProduct>(`${this.urlBase}/event/${eventId}`, extra);
    }

    updateEventExtra(extraId: number, extra: Partial<EventProduct>): Observable<EventProduct> {
        return this.http.put<EventProduct>(`${this.urlBase}/${extraId}`, extra);
    }

    removeExtraFromEvent(extraId: number): Observable<void> {
        return this.http.delete<void>(`${this.urlBase}/${extraId}`);
    }

    getMyExtras(): Observable<ExtraItem[]> {
        return this.http.get<ExtraItem[]>(`${this.urlBase}/my-extras`);
    }
}

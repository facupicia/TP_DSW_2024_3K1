import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StatsService {
    private http = inject(HttpClient);
    private baseUrl = environment.apiUrl + '/event';

    getMetrics(period: string): Observable<any> {
        return this.http.get<any>(`${this.baseUrl}/stats`, { params: { period } });
    }

    getComparative(period: string): Observable<any> {
        return this.http.get<any>(`${this.baseUrl}/stats/comparative`, { params: { period } });
    }

    exportPdf(period: string): Observable<Blob> {
        return this.http.get(`${this.baseUrl}/stats/export-pdf`, {
            params: { period },
            responseType: 'blob'
        });
    }

    exportCsv(period: string): Observable<Blob> {
        return this.http.get(`${this.baseUrl}/stats/export-csv`, {
            params: { period },
            responseType: 'blob'
        });
    }

    getPlatformStats(): Observable<any> {
        return this.http.get<any>(`${this.baseUrl}/stats/platform`);
    }

    getEventStats(eventId: number): Observable<any> {
        return this.http.get<any>(`${this.baseUrl}/stats/event/${eventId}`);
    }
}


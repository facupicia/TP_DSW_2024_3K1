import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

/* ============================================================================
   INTERFACES
============================================================================ */

export interface ComparativeData {
    totalRevenue: any;
    title: string;
    revenue: number;
    participants: number;
    attendanceRate: number;
    eventId?: number;
    date?: string;
}

export interface ComparativeResponse {
    comparative: ComparativeData[];
}

export interface MetricsResponse {
    totalRevenue: number;
    totalTickets: number;
    avgPrice: number;
    topEvents?: any[];
}

/* ============================================================================
   SERVICE
============================================================================ */

@Injectable({ providedIn: 'root' })
export class StatsService {
    private http = inject(HttpClient);
    private baseUrl = environment.apiUrl + '/event';

    getMetrics(period: string): Observable<MetricsResponse> {
        return this.http.get<MetricsResponse>(`${this.baseUrl}/stats`, { params: { period } });
    }

    getComparative(period: string): Observable<ComparativeResponse> {
        return this.http.get<ComparativeResponse>(`${this.baseUrl}/stats/comparative`, { params: { period } });
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


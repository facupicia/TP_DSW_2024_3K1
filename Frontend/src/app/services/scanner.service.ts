import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';

export interface TicketValidationResult {
  success: boolean;
  message?: string;
  code?: string;
  usedAt?: string;
  type?: 'ticket' | 'extra';
  ticket?: {
    id: number;
    codigo_unico: string;
    status: string;
    usedAt?: string;
    scannedById?: number;
    user?: { id: number; firstname: string; lastname: string };
    ticketType?: {
      id: number;
      status: string;
      name: string;
      event?: { id: number; title: string; date: string; time: string; active: boolean; user_id: number };
    };
  };
  extra?: {
    id: number;
    codigo_unico: string;
    status: string;
    usedAt?: string;
    scannedById?: number;
    quantity: number;
    user?: { id: number; firstname: string; lastname: string };
    eventProduct?: {
      id: number;
      isActive: boolean;
      product?: { name: string };
      event?: { id: number; title: string; date: string; time: string; active: boolean; user_id: number };
    };
  };
}

export interface ScannerAssignment {
    id: number;
    organizerId: number;
    scannerId: number;
    isActive: boolean;
    createdAt: string;
    scanner: {
        id: number;
        firstname: string;
        lastname: string;
        email: string;
        imgPerfil?: string;
    };
}

@Injectable({
    providedIn: 'root'
})
export class ScannerService {

    private http = inject(HttpClient);
    private urlBase: string = environment.apiUrl + "/scanner/";

    constructor() { }

    validateTicket(code: string): Observable<TicketValidationResult> {
        return this.http.post<TicketValidationResult>(`${this.urlBase}validate`, { code });
    }

    getHistory(): Observable<any[]> {
        return this.http.get<any[]>(`${this.urlBase}history`);
    }

    getOrganizerScanners(): Observable<ScannerAssignment[]> {
        return this.http.get<{ data: ScannerAssignment[], total: number }>(`${this.urlBase}team`).pipe(
            map(response => response.data || [])
        );
    }

    assignScannerToOrganizer(email: string): Observable<{ message: string; assignment: ScannerAssignment }> {
        return this.http.post<{ message: string; assignment: ScannerAssignment }>(`${this.urlBase}team`, { email });
    }

    removeScannerFromOrganizer(assignmentId: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${this.urlBase}team/${assignmentId}`);
    }
}

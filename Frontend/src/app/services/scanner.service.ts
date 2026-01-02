import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ScannerService {

    private http = inject(HttpClient);
    private urlBase: string = environment.apiUrl + "/scanner/";

    constructor() { }

    validateTicket(code: string): Observable<any> {
        return this.http.post(`${this.urlBase}validate`, { code });
    }

    getHistory(): Observable<any[]> {
        return this.http.get<any[]>(`${this.urlBase}history`);
    }
}

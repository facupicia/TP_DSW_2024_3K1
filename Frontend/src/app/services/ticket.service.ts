import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Ticket } from '../interfaces/ticket';

@Injectable({
  providedIn: 'root'
})
export class TicketService {

  private http = inject(HttpClient);
  private urlBase: string = environment.apiUrl + "/ticket/";

  comprarTicket(objeto: { cantidad: number, ticketTypeId: number }): Observable<any> {
    // Redirige al endpoint de pago
    const token = localStorage.getItem('token');
    const headers: HttpHeaders = new HttpHeaders(
      token ? { Authorization: `Bearer ${token}` } : {}
    );

    return this.http.post<any>(
      `${environment.apiUrl}/payment/create-preference`,
      { ticketQuantity: objeto.cantidad, ticketTypeId: objeto.ticketTypeId },
      { headers }
    ).pipe(
      timeout(15000),
      catchError((err) => {
        let message = 'Error desconocido al procesar el pago';
        if (err.name === 'TimeoutError') {
          message = 'Tiempo de espera agotado al contactar la pasarela';
        } else if (err.error?.message) {
          message = err.error.message;
        }
        return throwError(() => ({ ...err, userMessage: message }));
      })
    );
  }

  getTicketsByUser(userID: number): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`${this.urlBase}/${userID}`);
  }

  getLastPurchase(): Observable<{ tickets: Ticket[]; status: string }> {
    return this.http.get<{ tickets: Ticket[]; status: string }>(
      `${environment.apiUrl}/ticket/last-purchase`
    ).pipe(
      timeout(10000),
      catchError(err => throwError(() => err))
    );
  }

  cancelarTicket(id: number): Observable<any> {
    const token = localStorage.getItem('token');
    const headers: HttpHeaders = new HttpHeaders(
      token ? { Authorization: `Bearer ${token}` } : {}
    );
    return this.http.put<any>(`${this.urlBase}cancel/${id}`, {}, { headers });
  }
}




import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError, map } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Ticket } from '../interfaces/ticket';

@Injectable({
  providedIn: 'root'
})
export class TicketService {

  private http = inject(HttpClient);
  private urlBase: string = environment.apiUrl + "/ticket/";

  comprarTicket(objeto: { cantidad: number, ticketTypeId: number, promoterCode?: string }): Observable<any> {
    // Redirige al endpoint de pago
    const token = localStorage.getItem('token');
    const headers: HttpHeaders = new HttpHeaders(
      token ? { Authorization: `Bearer ${token}` } : {}
    );

    const body: any = { 
      ticketQuantity: objeto.cantidad, 
      ticketTypeId: objeto.ticketTypeId 
    };
    
    if (objeto.promoterCode) {
      body.promoterCode = objeto.promoterCode;
    }

    return this.http.post<any>(
      `${environment.apiUrl}/payment/create-preference`,
      body,
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
    return this.http.get<{ data: Ticket[], total: number }>(`${this.urlBase}${userID}`).pipe(
      map(response => response.data)
    );
  }

  getLastPurchase(): Observable<{ tickets: Ticket[]; status: string }> {
    return this.http.get<{ tickets: Ticket[]; status: string; success?: boolean }>(
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

  /**
   * Invite guests by sending free tickets to their emails
   */
  inviteGuests(ticketTypeId: number, emails: string[], quantity: number = 1): Observable<any> {
    return this.http.post<any>(`${this.urlBase}invite`, { ticketTypeId, emails, quantity });
  }
}




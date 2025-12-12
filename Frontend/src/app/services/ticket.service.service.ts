import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Ticket } from '../interfaces/ticket';

@Injectable({
  providedIn: 'root'
})
export class TicketServiceService {

  private http = inject(HttpClient);
  //ivate urlBase: string = "https://backend-eventlife.onrender.com/api/ticket/";
  private urlBase: string = "http://localhost:3000/api/ticket/";

  comprarTicket(objeto: { cantidad: number }, eventId: number, token: string): Observable<any> {
    const headers = new HttpHeaders().set('token', token);
     return this.http.post<any>(`${this.urlBase}buy/${eventId}`, objeto, { headers });
  }

  getTicketsByUser(token: string, userID: number): Observable<Ticket[]> {
    const headers = new HttpHeaders().set('token', token);
    return this.http.get<Ticket[]>(`${this.urlBase}/${userID}`, { headers });
  }


}


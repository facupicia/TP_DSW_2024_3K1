import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment.development';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Ticket } from '../interfaces/ticket';

@Injectable({
  providedIn: 'root'
})
export class TicketServiceService {

  private http = inject(HttpClient);
  private urlBase: string = environment.apiUrl + "/ticket/";

  comprarTicket(objeto: { cantidad: number }, eventId: number): Observable<any> {
    return this.http.post<any>(`${this.urlBase}buy/${eventId}`, objeto);
  }

  getTicketsByUser(userID: number): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`${this.urlBase}/${userID}`);
  }


}


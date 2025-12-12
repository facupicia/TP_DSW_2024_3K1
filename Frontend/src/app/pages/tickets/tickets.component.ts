import { Component, inject } from '@angular/core';
import { TicketServiceService } from '../../services/ticket.service.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './tickets.component.html',
  styleUrl: './tickets.component.css'
})
export class TicketsComponent {
  private tickService = inject(TicketServiceService);
  private route = inject(ActivatedRoute);
  private userID: string | null = null;

  tickets: any[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      this.userID = this.route.snapshot.paramMap.get('id'); // Asignar userID desde la ruta

      if (token && this.userID) { // Verificar que userID no sea null
        this.tickService.getTicketsByUser(Number(this.userID)).subscribe({
          next: (data) => {
            console.log(data);
            this.tickets = data;
          },
          error: (err) => {
            console.error('Error al obtener los tickets:', err);
          },
        });
      }
    }
  }
}


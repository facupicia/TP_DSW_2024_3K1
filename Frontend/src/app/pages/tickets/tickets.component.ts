import { Component, inject, OnInit } from '@angular/core';
import { TicketService } from '../../services/ticket.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { FormsModule } from '@angular/forms';

// Interfaz para ordenar el caos
interface EventGroup {
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventImage: string;
  eventId: number;
  tickets: any[];
}

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FormsModule],
  templateUrl: './tickets.component.html',
  styleUrl: './tickets.component.css'
})
export class TicketsComponent implements OnInit {
  private tickService = inject(TicketService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private userID: string | null = null;

  loading = true;
  // Ya no usamos un array plano, sino grupos
  groupedTickets: EventGroup[] = [];
  filteredGroups: EventGroup[] = [];
  hasTickets = false;
  searchTerm = '';
  collapsed: Set<number> = new Set();

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      // Intentamos obtener ID de la ruta, si no, del localStorage (opcional)
      this.userID = this.route.snapshot.paramMap.get('id');

      if (token && this.userID) {
        this.cargarTickets();
      } else {
        this.loading = false; // No hay usuario, no cargamos
      }
    }
  }

  cargarTickets() {
    this.tickService.getTicketsByUser(Number(this.userID)).subscribe({
      next: (data) => {
        this.agruparTicketsPorEvento(data);
        this.aplicarFiltroOrden();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al obtener los tickets:', err);
        this.loading = false;
      },
    });
  }

  // LA MAGIA: Convertir lista plana en grupos por evento
  agruparTicketsPorEvento(tickets: any[]) {
    if (!tickets || tickets.length === 0) {
      this.hasTickets = false;
      return;
    }

    this.hasTickets = true;
    const groups: { [key: number]: EventGroup } = {};

    tickets.forEach(ticket => {
      const evtId = ticket.eventId ?? ticket.event?.id ?? -1;

      if (!groups[evtId]) {
        groups[evtId] = {
          eventTitle: ticket.event?.title ?? ticket.titleEvent ?? 'Evento',
          eventDate: ticket.event?.date ?? '',
          eventLocation: ticket.event?.location ?? '',
          eventImage: ticket.event?.image ?? '',
          eventId: evtId,
          tickets: []
        };
      }
      groups[evtId].tickets.push(ticket);
    });

    // Convertimos el objeto map a un array para el HTML
    this.groupedTickets = Object.values(groups);
    this.aplicarFiltroOrden();
  }

  aplicarFiltroOrden() {
    const term = this.searchTerm.trim().toLowerCase();
    let groups = [...this.groupedTickets];
    if (term) {
      groups = groups.filter(g =>
        (g.eventTitle || '').toLowerCase().includes(term) ||
        (g.eventLocation || '').toLowerCase().includes(term)
      );
    }
    groups.sort((a, b) => {
      const da = new Date(a.eventDate).getTime();
      const db = new Date(b.eventDate).getTime();
      return da - db;
    });
    this.filteredGroups = groups;
  }

  toggleGroup(id: number) {
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
  }

  // NUEVA FUNCIÓN COMPARTIR
  compartirTicket(ticket: any, group: EventGroup) {
    const shareData = {
      title: `Mi Entrada para ${group.eventTitle}`,
      text: `¡Hola! Aquí tienes mi entrada para ${group.eventTitle} el ${group.eventDate}. Ubicación: ${group.eventLocation}. Código: ${ticket.codigo_unico}`,
      url: ticket.qrCode // Compartimos el enlace al QR
    };

    if (navigator.share) {
      navigator.share(shareData)
        .then(() => console.log('Ticket compartido con éxito'))
        .catch((err) => console.log('Error al compartir', err));
    } else {
      // Fallback si el navegador no soporta share nativo (Desktop)
    }
  }

  trackGroup(_i: number, g: EventGroup) { return g.eventId; }
  trackTicket(_i: number, t: any) { return t.id || t.codigo_unico; }


  irAEventos() {
    this.router.navigate(['/events']);
  }
}

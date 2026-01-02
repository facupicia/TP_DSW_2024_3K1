import { Component, inject, OnInit } from '@angular/core';
import { TicketService } from '../../services/ticket.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { FormsModule } from '@angular/forms';
import { TicketCardComponent } from './ticket-card.component'; // Asegúrate de importar tu componente 3D
import html2canvas from 'html2canvas'; // <--- IMPORTANTE

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
  imports: [CommonModule, HeaderComponent, FormsModule, TicketCardComponent],
  templateUrl: './tickets.component.html',
  styleUrl: './tickets.component.css'
})
export class TicketsComponent implements OnInit {
  private tickService = inject(TicketService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private userID: string | null = null;

  loading = true;
  groupedTickets: EventGroup[] = [];
  filteredGroups: EventGroup[] = [];
  hasTickets = false;
  searchTerm = '';

  sharingEventTitle = '';
  sharingEventImage = '';
  sharingEventDate = '';
  sharingEventLocation = '';
  sharingQrCode = '';
  sharingTicketCode = '';

  // CAMBIO CLAVE: Usamos 'expanded' en lugar de 'collapsed'
  // Al iniciar vacío (new Set()), todo estará cerrado por defecto.
  expanded: Set<number> = new Set();

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      this.userID = this.route.snapshot.paramMap.get('id');

      if (token && this.userID) {
        this.cargarTickets();
      } else {
        this.loading = false;
      }
    }
  }

  async compartirTicketNativo(ticket: any, group: EventGroup) {
    // 1. Preparamos los datos en la plantilla oculta
    this.sharingEventTitle = group.eventTitle;
    this.sharingEventImage = group.eventImage;
    this.sharingEventDate = group.eventDate;
    this.sharingEventLocation = group.eventLocation;
    this.sharingQrCode = ticket.qrCode;
    this.sharingTicketCode = ticket.codigo_unico;

    // Esperamos un milisegundo para que Angular actualice el HTML oculto
    await new Promise(resolve => setTimeout(resolve, 100));

    const element = document.getElementById('ticket-to-share');
    if (!element) return;

    try {
      // 2. Generamos la imagen (Canvas)
      const canvas = await html2canvas(element, {
        scale: 2, // Mejor calidad (Retina)
        backgroundColor: '#ffffff', // Fondo blanco seguro
        logging: false
      });

      // 3. Convertimos Canvas a Blob (Archivo)
      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const file = new File([blob], `ticket_${ticket.codigo_unico}.png`, { type: 'image/png' });

        // 4. Usamos la API Nativa de Compartir
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Entrada: ${group.eventTitle}`,
              text: `¡Hola! Aquí tienes tu entrada para ${group.eventTitle}.`
            });
            console.log('¡Compartido con éxito!');
          } catch (err) {
            console.error('Error al compartir', err);
          }
        } else {
          // Fallback para PC o navegadores viejos: Descargar la imagen
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `entrada_${group.eventTitle}.png`;
          link.click();
          alert('Imagen descargada (Tu navegador no soporta compartir directo).');
        }
      }, 'image/png');

    } catch (error) {
      console.error('Falló la generación de imagen', error);
      alert('No pudimos generar la imagen del ticket.');
    }
  }


  cargarTickets() {
    this.tickService.getTicketsByUser(Number(this.userID)).subscribe({
      next: (data) => {
        this.agruparTicketsPorEvento(data);
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al obtener los tickets:', err);
        this.loading = false;
      },
    });
  }

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
    // Ordenar por fecha más reciente primero
    groups.sort((a, b) => {
      const da = new Date(a.eventDate).getTime();
      const db = new Date(b.eventDate).getTime();
      return db - da;
    });
    this.filteredGroups = groups;
  }

  // LÓGICA INVERTIDA: Si está, lo saca (cierra). Si no, lo agrega (abre).
  toggleGroup(id: number) {
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
    } else {
      // Opcional: Si quieres modo "Acordeón estricto" (solo uno abierto a la vez), descomenta esto:
      // this.expanded.clear(); 
      this.expanded.add(id);
    }
  }

  // Helper para el HTML
  isExpanded(id: number): boolean {
    return this.expanded.has(id);
  }

  trackGroup(_i: number, g: EventGroup) { return g.eventId; }
  trackTicket(_i: number, t: any) { return t.id || t.codigo_unico; }

  irAEventos() {
    this.router.navigate(['/explore']); // Ajusta según tu ruta real
  }
}
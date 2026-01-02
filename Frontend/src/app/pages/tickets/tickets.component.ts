import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
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

  private cdr = inject(ChangeDetectorRef); // <--- 2. INYECTARLO

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
    // 1. Llenamos los datos
    this.sharingEventTitle = group.eventTitle;
    this.sharingEventImage = group.eventImage;
    this.sharingEventDate = group.eventDate;
    this.sharingEventLocation = group.eventLocation;
    this.sharingQrCode = ticket.qrCode;
    this.sharingTicketCode = ticket.codigo_unico;

    // 2. FORZAMOS ACTUALIZACIÓN DEL DOM (Sin esperar 100ms)
    // Esto hace que el HTML oculto se actualice instantáneamente
    this.cdr.detectChanges(); 

    const element = document.getElementById('ticket-to-share');
    if (!element) return;

    try {
      // 3. GENERAMOS LA IMAGEN CON CORS ACTIVADO
      const canvas = await html2canvas(element, {
        scale: 2, 
        backgroundColor: '#ffffff',
        useCORS: true, // <--- CRÍTICO: Permite cargar imágenes externas
        logging: false, // Desactivar logs para producción
        // Evitamos que clone iframes o cosas raras que ralentizan
        ignoreElements: (el) => el.tagName === 'IFRAME' 
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
            alert("Error: No se pudo generar la imagen."); 
            return;
        }

        const file = new File([blob], `ticket-${ticket.codigo_unico}.png`, { type: 'image/png' });

        // 4. INTENTAMOS COMPARTIR
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              // A veces iOS prefiere que no mandes texto si mandas archivos, probemos minimalista
              title: 'Mi Entrada', 
            });
          } catch (err: any) {
            // Si el usuario cancela, no es un error grave.
            if (err.name !== 'AbortError') {
                console.error('Error compartiendo:', err);
                alert('No se pudo abrir el menú compartir. Intenta descargar.');
            }
          }
        } else {
          // FALLBACK: Si el navegador no soporta compartir archivos (ej: Chrome en Android a veces falla)
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `entrada_${group.eventTitle}.png`;
          link.click();
        }
      }, 'image/png');

    } catch (error) {
      console.error('Falló html2canvas:', error);
      alert('Hubo un problema generando la imagen del ticket.');
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
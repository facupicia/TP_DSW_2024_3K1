import { ChangeDetectorRef, Component, inject, OnInit, DestroyRef } from '@angular/core';
import { TicketService } from '../../services/ticket.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { FormsModule } from '@angular/forms';
import { TicketCardComponent } from './ticket-card.component';
import * as htmlToImage from 'html-to-image';
import { ToastService } from '../../services/toast.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface EventGroup {
  eventTitle: string;
  eventDate: string;
  ciudad: string;
  eventImage: string;
  eventId: number;
  tickets: any[];
}

@Component({
    selector: 'app-tickets',
    imports: [CommonModule, HeaderComponent, FormsModule, TicketCardComponent, RouterLink],
    templateUrl: './tickets.component.html',
    styleUrl: './tickets.component.css'
})
export class TicketsComponent implements OnInit {
  private tickService = inject(TicketService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

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
  sharingEventStatus = '';

  private cdr = inject(ChangeDetectorRef);

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
    // 1. Llenar datos
    this.sharingEventTitle = group.eventTitle;
    this.sharingEventImage = group.eventImage || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30';
    this.sharingEventDate = group.eventDate;
    this.sharingEventLocation = group.ciudad;
    this.sharingQrCode = ticket.qrCode;
    this.sharingTicketCode = ticket.codigo_unico;

    // 2. Forzar actualización del DOM
    this.cdr.detectChanges();

    // Esperar un momento para que el DOM se actualice y las imágenes carguen
    await new Promise(resolve => setTimeout(resolve, 100));

    const element = document.getElementById('ticket-to-share');
    if (!element) return;

    try {
      // 3. GENERAR IMAGEN (PNG)
      // html-to-image maneja mejor las esperas de carga de imágenes internas
      const dataUrl = await htmlToImage.toPng(element, {
        backgroundColor: '#ffffff',
        cacheBust: true, // Ayuda a que no cachee imágenes rotas
        pixelRatio: 2,   // Alta calidad (Retina)
        skipAutoScale: true
      });

      // 4. Convertir Base64 a Archivo para compartir
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `ticket-${ticket.codigo_unico}.png`, { type: 'image/png' });

      // 5. Compartir
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Mi Entrada',
          text: `Entrada para ${group.eventTitle}`
        });
      } else {
        // Fallback
        const link = document.createElement('a');
        link.download = `ticket-${ticket.codigo_unico}.png`;
        link.href = dataUrl;
        link.click();
      }

    } catch (error) {
      this.toastService.error('No se pudo crear la imagen del ticket. Intenta de nuevo.');
    }
  }


  cargarTickets() {
    this.tickService.getTicketsByUser(Number(this.userID)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.agruparTicketsPorEvento(data);
        this.loading = false;
      },
      error: () => {
        // Error handled by interceptor
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
          ciudad: ticket.event?.ciudad ?? '',
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
        (g.ciudad || '').toLowerCase().includes(term)
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

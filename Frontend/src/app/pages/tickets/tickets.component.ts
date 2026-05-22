import { ChangeDetectorRef, Component, inject, OnInit, DestroyRef, HostListener } from '@angular/core';
import { TicketService } from '../../services/ticket.service';
import { ExtraService } from '../../services/extra.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { forkJoin } from 'rxjs';
import { TicketFlipCardComponent, TicketDisplayStatus } from './ticket-flip-card.component';
import * as htmlToImage from 'html-to-image';

export interface EventGroup {
  eventTitle: string;
  eventDate: string;
  ciudad: string;
  eventImage: string;
  eventId: number;
  tickets: any[];
  extras: any[];
}

@Component({
  selector: 'app-tickets',
  imports: [
    CommonModule,
    HeaderComponent,
    FormsModule,
    RouterLink,
    TicketFlipCardComponent
  ],
  templateUrl: './tickets.component.html',
  styleUrl: './tickets.component.css'
})
export class TicketsComponent implements OnInit {
  private tickService = inject(TicketService);
  private extraService = inject(ExtraService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

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

  // Acordeón: solo los eventos en este set están expandidos
  expanded: Set<number> = new Set();

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.userID = this.route.snapshot.paramMap.get('id');

      this.authService.ensureCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
        const routeUserId = Number(this.userID);
        const currentUserId = Number(user?.id);
        const ticketUserId = Number.isSafeInteger(routeUserId) && routeUserId > 0
          ? routeUserId
          : currentUserId;

        if (user && Number.isSafeInteger(ticketUserId) && ticketUserId > 0) {
          this.userID = String(ticketUserId);
          this.cargarTickets();
        } else {
          this.loading = false;
          this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
        }
      });
    }
  }

  @HostListener('document:ticketShare', ['$event'])
  onTicketShare(event: any) {
    const { ticket, group } = event.detail;
    if (ticket && group) {
      this.compartirTicketNativo(ticket, group);
    }
  }

  async compartirTicketNativo(ticket: any, group: EventGroup) {
    this.sharingEventTitle = group.eventTitle;
    this.sharingEventImage = group.eventImage || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30';
    this.sharingEventDate = group.eventDate;
    this.sharingEventLocation = group.ciudad;
    this.sharingQrCode = ticket.qrCode;
    this.sharingTicketCode = ticket.codigo_unico;

    this.cdr.detectChanges();

    await new Promise(resolve => setTimeout(resolve, 150));

    const element = document.getElementById('ticket-to-share');
    if (!element) return;

    try {
      const dataUrl = await htmlToImage.toPng(element, {
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 2,
        skipAutoScale: true
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `ticket-${ticket.codigo_unico}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Mi Entrada',
          text: `Entrada para ${group.eventTitle}`
        });
      } else {
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
    forkJoin({
      tickets: this.tickService.getTicketsByUser(Number(this.userID)),
      extras: this.extraService.getMyExtras()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ tickets, extras }) => {
        this.agruparTicketsPorEvento(tickets, extras);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  agruparTicketsPorEvento(tickets: any[], extras: any[]) {
    const hasTickets = tickets && tickets.length > 0;
    const hasExtras = extras && extras.length > 0;

    if (!hasTickets && !hasExtras) {
      this.hasTickets = false;
      return;
    }

    this.hasTickets = true;
    const groups: { [key: number]: EventGroup } = {};

    const ensureGroup = (evtId: number, evt: any) => {
      if (!groups[evtId]) {
        groups[evtId] = {
          eventTitle: evt?.title ?? 'Evento',
          eventDate: evt?.date ?? '',
          ciudad: evt?.ciudad ?? evt?.city ?? '',
          eventImage: evt?.image ?? '',
          eventId: evtId,
          tickets: [],
          extras: []
        };
      }
    };

    tickets.forEach(ticket => {
      const evtId = ticket.eventId ?? ticket.event?.id ?? -1;
      ensureGroup(evtId, ticket.event);
      groups[evtId].tickets.push(ticket);
    });

    extras.forEach(extra => {
      const evt = extra.eventProduct?.event;
      const evtId = evt?.id ?? -1;
      ensureGroup(evtId, evt);
      groups[evtId].extras.push(extra);
    });

    this.groupedTickets = Object.values(groups);

    // Ordenar: eventos futuros primero, luego pasados
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    this.groupedTickets.sort((a, b) => {
      const da = new Date(a.eventDate).getTime();
      const db = new Date(b.eventDate).getTime();
      const aIsFuture = da >= now.getTime();
      const bIsFuture = db >= now.getTime();

      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      return db - da; // Más recientes primero
    });

    this.aplicarFiltroOrden();

    // Expandir automáticamente el primer evento futuro si existe
    const firstFuture = this.filteredGroups.find(g => new Date(g.eventDate).getTime() >= now.getTime());
    if (firstFuture) {
      this.expanded.add(firstFuture.eventId);
    }
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
    this.filteredGroups = groups;
  }

  toggleGroup(id: number) {
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
    } else {
      this.expanded.add(id);
    }
  }

  isExpanded(id: number): boolean {
    return this.expanded.has(id);
  }

  getTicketStatus(ticket: any, eventDate: string): TicketDisplayStatus {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const evtDate = new Date(eventDate).getTime();

    if (ticket.status === 'used') return 'used';
    if (evtDate < now.getTime()) return 'past';
    return 'active';
  }

  trackGroup(_i: number, g: EventGroup) { return g.eventId; }
  trackTicket(_i: number, t: any) { return t.id || t.codigo_unico; }
  trackExtra(_i: number, e: any) { return e.id; }

  irAEventos() {
    this.router.navigate(['/events']);
  }
}

import { Component, inject, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { PromoterService } from '../../services/promoter.service';
import { EventService } from '../../services/event.service';
import { ToastService } from '../../services/toast.service';
import { PromoterStats, PromoterStatsDetail, EventPromoterStats } from '../../interfaces/promoter';
import { Evento } from '../../interfaces/event';

@Component({
    selector: 'app-promoter-stats',
    imports: [FormsModule, RouterModule, HeaderComponent],
    templateUrl: './promoter-stats.component.html',
    styleUrls: ['./promoter-stats.component.css']
})
export class PromoterStatsComponent implements OnInit {
  private promoterService = inject(PromoterService);
  private eventService = inject(EventService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);

  // View mode: 'overview' | 'detail'
  viewMode: 'overview' | 'detail' = 'overview';
  
  // Overview data
  promotersStats: PromoterStats[] = [];
  eventsStats: EventPromoterStats[] = [];
  summary: any = {};
  
  // Detail data
  selectedPromoterId: number | null = null;
  promoterDetail: PromoterStatsDetail | null = null;
  
  // Filters
  startDate: string = '';
  endDate: string = '';
  
  // PDF Export
  organizerEvents: Evento[] = [];
  selectedEventId: number | null = null;
  loadingEvents = false;
  exportingPdf = false;
  
  loading = false;

  ngOnInit(): void {
    // Check if we're viewing a specific promoter's stats
    const promoterId = this.route.snapshot.paramMap.get('id');
    if (promoterId) {
      this.selectedPromoterId = Number(promoterId);
      this.viewMode = 'detail';
      this.loadPromoterDetail();
    } else {
      this.loadOverviewStats();
      this.loadEventsStats();
      this.loadOrganizerEvents();
    }
  }

  loadOrganizerEvents(): void {
    this.loadingEvents = true;
    this.eventService.obtenerEventosUsuario().subscribe({
      next: (events) => {
        this.organizerEvents = events;
        this.loadingEvents = false;
      },
      error: (err) => {
        console.error('Error loading events:', err);
        this.loadingEvents = false;
      }
    });
  }

  exportPromotersPdf(): void {
    if (!this.selectedEventId) {
      this.toastService.error('Selecciona un evento para exportar');
      return;
    }

    this.exportingPdf = true;
    this.promoterService.exportPromotersStatsPdf(this.selectedEventId).subscribe({
      next: (blob) => {
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `estadisticas-rrpp-evento-${this.selectedEventId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        this.toastService.success('PDF descargado exitosamente');
        this.exportingPdf = false;
      },
      error: (err) => {
        console.error('Error exporting PDF:', err);
        this.toastService.error('Error al generar el PDF');
        this.exportingPdf = false;
      }
    });
  }

  loadOverviewStats(): void {
    this.loading = true;
    this.promoterService.getPromotersStats(undefined, this.startDate || undefined, this.endDate || undefined).subscribe({
      next: (data) => {
        this.promotersStats = data.promoters;
        this.summary = data.summary;
        this.loading = false;
      },
      error: (err) => {
        this.toastService.error('Error al cargar estadísticas');
        this.loading = false;
      }
    });
  }

  loadEventsStats(): void {
    this.promoterService.getEventsPromoterStats().subscribe({
      next: (data) => {
        this.eventsStats = data.events;
      },
      error: (err) => {
        console.error('Error loading events stats:', err);
      }
    });
  }

  loadPromoterDetail(): void {
    if (!this.selectedPromoterId) return;
    
    this.loading = true;
    this.promoterService.getPromoterStatsById(
      this.selectedPromoterId, 
      undefined, 
      this.startDate || undefined, 
      this.endDate || undefined
    ).subscribe({
      next: (data) => {
        this.promoterDetail = data;
        this.loading = false;
      },
      error: (err) => {
        this.toastService.error('Error al cargar detalles del promotor');
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    if (this.viewMode === 'overview') {
      this.loadOverviewStats();
    } else {
      this.loadPromoterDetail();
    }
  }

  clearFilters(): void {
    this.startDate = '';
    this.endDate = '';
    this.applyFilters();
  }

  viewPromoterDetail(promoterId: number): void {
    this.selectedPromoterId = promoterId;
    this.viewMode = 'detail';
    this.loadPromoterDetail();
  }

  backToOverview(): void {
    this.viewMode = 'overview';
    this.selectedPromoterId = null;
    this.promoterDetail = null;
    this.loadOverviewStats();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

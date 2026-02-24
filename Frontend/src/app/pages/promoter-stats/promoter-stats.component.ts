import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { PromoterService } from '../../services/promoter.service';
import { ToastService } from '../../services/toast.service';
import { PromoterStats, PromoterStatsDetail, EventPromoterStats } from '../../interfaces/promoter';

@Component({
  selector: 'app-promoter-stats',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
  templateUrl: './promoter-stats.component.html',
  styleUrls: ['./promoter-stats.component.css']
})
export class PromoterStatsComponent implements OnInit {
  private promoterService = inject(PromoterService);
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
    }
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

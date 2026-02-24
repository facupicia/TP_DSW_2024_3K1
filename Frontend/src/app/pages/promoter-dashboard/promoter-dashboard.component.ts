import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { PromoterService } from '../../services/promoter.service';
import { ToastService } from '../../services/toast.service';
import { PromoterProfile, MyPromoterStats, MyAssignedEvents, AssignedEvent } from '../../interfaces/promoter';

@Component({
  selector: 'app-promoter-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
  templateUrl: './promoter-dashboard.component.html',
  styleUrls: ['./promoter-dashboard.component.css']
})
export class PromoterDashboardComponent implements OnInit {
  private promoterService = inject(PromoterService);
  private toastService = inject(ToastService);

  profile: PromoterProfile | null = null;
  stats: MyPromoterStats | null = null;
  assignedEvents: MyAssignedEvents | null = null;
  loading = false;
  loadingEvents = false;
  
  // Filters
  startDate: string = '';
  endDate: string = '';

  ngOnInit(): void {
    this.loadProfile();
    this.loadStats();
    this.loadAssignedEvents();
  }

  loadProfile(): void {
    this.promoterService.getPromoterProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
      },
      error: (err) => {
        this.toastService.error('Error al cargar perfil');
      }
    });
  }

  loadStats(): void {
    this.loading = true;
    this.promoterService.getMyStats(
      undefined,
      this.startDate || undefined,
      this.endDate || undefined
    ).subscribe({
      next: (stats) => {
        this.stats = stats;
        this.loading = false;
      },
      error: (err) => {
        this.toastService.error('Error al cargar estadísticas');
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.loadStats();
  }

  clearFilters(): void {
    this.startDate = '';
    this.endDate = '';
    this.loadStats();
  }

  copyPromoterCode(): void {
    if (this.profile?.promoterCode) {
      navigator.clipboard.writeText(this.profile.promoterCode).then(() => {
        this.toastService.success('Código copiado al portapapeles');
      });
    }
  }

  sharePromoterLink(): void {
    // Generate a shareable link with the promoter code
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/events?promoterCode=${this.profile?.promoterCode}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      this.toastService.success('Link de referido copiado');
    });
  }

  loadAssignedEvents(): void {
    this.loadingEvents = true;
    this.promoterService.getMyAssignedEvents().subscribe({
      next: (data) => {
        this.assignedEvents = data;
        this.loadingEvents = false;
      },
      error: (err) => {
        this.toastService.error('Error al cargar eventos asignados');
        this.loadingEvents = false;
      }
    });
  }

  copyEventLink(event: AssignedEvent): void {
    navigator.clipboard.writeText(event.shareableLink).then(() => {
      this.toastService.success('Link del evento copiado al portapapeles');
    });
  }

  shareViaWhatsApp(event: AssignedEvent): void {
    const text = `¡Hola! Te invito a este evento: ${event.title}. Compra tu entrada aquí: ${event.shareableLink}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
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

  formatMonth(monthString: string): string {
    const date = new Date(monthString);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long'
    });
  }
}

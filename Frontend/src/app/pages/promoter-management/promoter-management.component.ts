import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { PromoterService } from '../../services/promoter.service';
import { ToastService } from '../../services/toast.service';
import { EventService } from '../../services/event.service';
import { Promoter, CreatePromoterRequest, PromoterEventAssignment } from '../../interfaces/promoter';

@Component({
    selector: 'app-promoter-management',
    imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
    templateUrl: './promoter-management.component.html',
    styleUrls: ['./promoter-management.component.css']
})
export class PromoterManagementComponent implements OnInit {
  private promoterService = inject(PromoterService);
  private toastService = inject(ToastService);
  private eventService = inject(EventService);

  promoters: Promoter[] = [];
  loading = false;
  showAddModal = false;
  showEditModal = false;
  showToggleModal = false;
  showAssignEventsModal = false;
  selectedPromoter: Promoter | null = null;

  // Form data - simplified, only email needed
  newPromoterEmail = '';
  newPromoterCommission = 10;
  newPromoterNotes = '';

  editForm = {
    commissionPercentage: 10,
    isActive: true,
    notes: ''
  };

  // Event assignment
  organizerEvents: any[] = [];
  assignedEventIds: number[] = [];
  promoterAssignedEvents: PromoterEventAssignment[] = [];

  ngOnInit(): void {
    this.loadPromoters();
  }

  loadPromoters(): void {
    this.loading = true;
    this.promoterService.getMyPromoters().subscribe({
      next: (promoters) => {
        this.promoters = promoters;
        this.loading = false;
      },
      error: (err) => {
        this.toastService.error('Error al cargar promotores');
        this.loading = false;
      }
    });
  }

  openAddModal(): void {
    this.newPromoterEmail = '';
    this.newPromoterCommission = 10;
    this.newPromoterNotes = '';
    this.showAddModal = true;
  }

  closeAddModal(): void {
    this.showAddModal = false;
  }

  addPromoter(): void {
    if (!this.newPromoterEmail) {
      this.toastService.error('El email es requerido');
      return;
    }

    this.loading = true;
    this.promoterService.addPromoterByEmail(
      this.newPromoterEmail,
      this.newPromoterCommission,
      this.newPromoterNotes
    ).subscribe({
      next: (response) => {
        this.toastService.success(response.message || 'Promotor agregado exitosamente');
        this.loadPromoters();
        this.closeAddModal();
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Error al agregar promotor');
        this.loading = false;
      }
    });
  }

  openEditModal(promoter: Promoter): void {
    this.selectedPromoter = promoter;
    this.editForm = {
      commissionPercentage: promoter.commissionPercentage,
      isActive: promoter.isActive,
      notes: promoter.notes || ''
    };
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedPromoter = null;
  }

  updatePromoter(): void {
    if (!this.selectedPromoter) return;

    this.loading = true;
    this.promoterService.updatePromoter(this.selectedPromoter.id, {
      commissionPercentage: this.editForm.commissionPercentage,
      isActive: this.editForm.isActive,
      notes: this.editForm.notes
    }).subscribe({
      next: () => {
        this.toastService.success('Promotor actualizado');
        this.loadPromoters();
        this.closeEditModal();
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Error al actualizar');
        this.loading = false;
      }
    });
  }

  openToggleModal(promoter: Promoter): void {
    this.selectedPromoter = promoter;
    this.showToggleModal = true;
  }

  closeToggleModal(): void {
    this.showToggleModal = false;
    this.selectedPromoter = null;
  }

  togglePromoterStatus(): void {
    if (!this.selectedPromoter) return;

    this.loading = true;
    const newStatus = !this.selectedPromoter.isActive;
    
    this.promoterService.updatePromoter(this.selectedPromoter.id, {
      isActive: newStatus
    }).subscribe({
      next: () => {
        this.toastService.success(newStatus ? 'Promotor activado' : 'Promotor desactivado');
        this.loadPromoters();
        this.closeToggleModal();
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Error al cambiar estado');
        this.loading = false;
      }
    });
  }

  copyPromoterCode(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      this.toastService.success('Código copiado al portapapeles');
    });
  }



  getActivePromotersCount(): number {
    return this.promoters.filter(p => p.isActive).length;
  }

  getAverageCommission(): string {
    if (!this.promoters.length) return '0.0';
    const sum = this.promoters.reduce((acc, p) => acc + p.commissionPercentage, 0);
    return (sum / this.promoters.length).toFixed(1);
  }

  // ==================== EVENT ASSIGNMENT ====================

  openAssignEventsModal(promoter: Promoter): void {
    this.selectedPromoter = promoter;
    this.showAssignEventsModal = true;
    this.loadOrganizerEvents();
    this.loadPromoterAssignments(promoter.id);
  }

  closeAssignEventsModal(): void {
    this.showAssignEventsModal = false;
    this.selectedPromoter = null;
    this.organizerEvents = [];
    this.assignedEventIds = [];
    this.promoterAssignedEvents = [];
  }

  loadOrganizerEvents(): void {
    this.eventService.obtenerEventosUsuario().subscribe({
      next: (events) => {
        this.organizerEvents = events;
      },
      error: (err) => {
        this.toastService.error('Error al cargar eventos');
      }
    });
  }

  loadPromoterAssignments(promoterGroupId: number): void {
    this.promoterService.getPromoterById(promoterGroupId).subscribe({
      next: (promoter) => {
        this.promoterAssignedEvents = promoter.assignedEvents || [];
        this.assignedEventIds = this.promoterAssignedEvents
          .filter(ae => ae.isActive)
          .map(ae => ae.id);
      },
      error: (err) => {
        this.toastService.error('Error al cargar asignaciones');
      }
    });
  }

  isEventAssigned(eventId: number): boolean {
    return this.assignedEventIds.includes(eventId);
  }

  toggleEventAssignment(eventId: number): void {
    if (!this.selectedPromoter) return;

    const isCurrentlyAssigned = this.isEventAssigned(eventId);

    if (isCurrentlyAssigned) {
      // Remove assignment
      this.promoterService.removeFromEvent(this.selectedPromoter.id, eventId).subscribe({
        next: () => {
          this.assignedEventIds = this.assignedEventIds.filter(id => id !== eventId);
          this.toastService.success('Evento desasignado');
        },
        error: (err) => {
          this.toastService.error(err.error?.message || 'Error al desasignar evento');
        }
      });
    } else {
      // Add assignment
      this.promoterService.assignToEvent(this.selectedPromoter.id, eventId).subscribe({
        next: () => {
          this.assignedEventIds.push(eventId);
          this.toastService.success('Evento asignado al promotor');
        },
        error: (err) => {
          this.toastService.error(err.error?.message || 'Error al asignar evento');
        }
      });
    }
  }

  copyEventLink(eventId: number, promoterCode: string): void {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/event/${eventId}?promo=${promoterCode}`;
    navigator.clipboard.writeText(link).then(() => {
      this.toastService.success('Link copiado al portapapeles');
    });
  }
}

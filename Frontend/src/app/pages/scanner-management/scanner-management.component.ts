import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { ScannerAssignment, ScannerService } from '../../services/scanner.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-scanner-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
  templateUrl: './scanner-management.component.html',
  styleUrls: ['./scanner-management.component.css']
})
export class ScannerManagementComponent implements OnInit {
  private scannerService = inject(ScannerService);
  private toastService = inject(ToastService);

  scannerAssignments: ScannerAssignment[] = [];
  loading = false;
  showAddModal = false;
  scannerEmail = '';
  assigningScanner = false;
  removingScannerId: number | null = null;

  ngOnInit(): void {
    this.loadScanners();
  }

  loadScanners(): void {
    this.loading = true;
    this.scannerService.getOrganizerScanners().subscribe({
      next: (assignments) => {
        this.scannerAssignments = assignments;
        this.loading = false;
      },
      error: () => {
        this.toastService.error('Error al cargar scanners');
        this.loading = false;
      }
    });
  }

  openAddModal(): void {
    this.scannerEmail = '';
    this.showAddModal = true;
  }

  closeAddModal(): void {
    this.showAddModal = false;
  }

  assignScanner(): void {
    const email = this.scannerEmail.trim().toLowerCase();
    if (!email) {
      this.toastService.warning('Ingresa el email del usuario');
      return;
    }

    this.assigningScanner = true;
    this.scannerService.assignScannerToOrganizer(email).subscribe({
      next: (response) => {
        this.toastService.success(response.message || 'Scanner asignado');
        this.assigningScanner = false;
        this.closeAddModal();
        this.loadScanners();
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Error al asignar scanner');
        this.assigningScanner = false;
      }
    });
  }

  removeScanner(assignment: ScannerAssignment): void {
    if (!confirm(`¿Quitar a ${assignment.scanner.firstname} ${assignment.scanner.lastname} como scanner de tu organización?`)) return;

    this.removingScannerId = assignment.id;
    this.scannerService.removeScannerFromOrganizer(assignment.id).subscribe({
      next: () => {
        this.scannerAssignments = this.scannerAssignments.filter(item => item.id !== assignment.id);
        this.toastService.success('Scanner desasignado');
        this.removingScannerId = null;
      },
      error: (err) => {
        this.toastService.error(err.error?.message || 'Error al desasignar scanner');
        this.removingScannerId = null;
      }
    });
  }

  getActiveScannersCount(): number {
    return this.scannerAssignments.length;
  }
}

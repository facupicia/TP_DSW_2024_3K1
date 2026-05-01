import { Component, inject, OnInit } from '@angular/core';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { FormsModule } from '@angular/forms'; // Necesario para el buscador
import { ToastService } from '../../services/toast.service';
import { RouterLink } from '@angular/router';
import { EventImageFallbackDirective } from '../../directives/event-image-fallback.directive';
@Component({
    selector: 'app-mis-eventos',
    imports: [CommonModule, HeaderComponent, FormsModule, RouterLink, EventImageFallbackDirective],
    templateUrl: './mis-eventos.component.html',
    styleUrl: './mis-eventos.component.css'
})
export class MisEventosComponent implements OnInit {

  private router = inject(Router);
  private toastService = inject(ToastService);

  eventos: Evento[] = [];
  eventosFiltrados: Evento[] = []; // Array auxiliar para el buscador
  searchTerm: string = '';

  constructor(private eventoService: EventService) { }

  ngOnInit(): void {
    this.eventoService.obtenerEventosUsuario().subscribe({
      next: (eventos) => {
        this.eventos = eventos.map(evento => ({
          ...evento,
          date: new Date(evento.date)
        }));
        this.eventosFiltrados = this.eventos;
      }
      // Error handled by interceptor
    });
  }

  // Lógica de búsqueda en tiempo real
  filtrarEventos() {
    if (!this.searchTerm) {
      this.eventosFiltrados = this.eventos;
    } else {
      const term = this.searchTerm.toLowerCase();
      this.eventosFiltrados = this.eventos.filter(e =>
        e.title.toLowerCase().includes(term) ||
        (e.direccion?.toLowerCase().includes(term) ?? false) ||
        (e.ciudad?.toLowerCase().includes(term) ?? false)
      );
    }
  }

  isPublic(isPublic: boolean): string {
    return isPublic ? 'Público' : 'Privado';
  }

  // Verifica si el evento ya pasó
  isEventoPasado(fecha: Date | string): boolean {
    return new Date(fecha) < new Date();
  }

  editEvent(id: number): void {
    this.router.navigate([`edit-event/${id}`]);
  }

  borrarEvent(id: number): void {
    if (confirm('¿Estás seguro de que deseas eliminar este evento? Esta acción no se puede deshacer.')) {
      this.eventoService.borrarEvento(id).subscribe({
        next: () => {
          this.eventos = this.eventos.filter(evento => evento.id !== id);
          this.filtrarEventos();
          this.toastService.success('Evento eliminado correctamente');
        }
        // Error handled by interceptor
      });
    }
  }

  verEvento(id: number): void {
    this.router.navigate([`event/${id}`]);
  }
  verEstadisticasEvento(id: number): void {
    this.router.navigate([`event/${id}/stats`]);
  }
  verConfiguracion(id: number): void {
    this.router.navigate([`event/${id}/config`]);
  }

  crearEvento(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.router.navigate(['/create-event']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  ordenarPorTitulo(): void {
    this.eventosFiltrados.sort((a, b) => a.title.localeCompare(b.title));
  }

  ordenarPorFecha(): void {
    this.eventosFiltrados.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Orden descendente (más recientes primero)
  }
}

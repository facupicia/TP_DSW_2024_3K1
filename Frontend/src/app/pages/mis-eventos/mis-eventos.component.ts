import { Component, inject, OnInit } from '@angular/core';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { FormsModule } from '@angular/forms'; // Necesario para el buscador

@Component({
  selector: 'app-mis-eventos',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FormsModule],
  templateUrl: './mis-eventos.component.html',
  styleUrl: './mis-eventos.component.css'
})
export class MisEventosComponent implements OnInit {

  private router = inject(Router);

  eventos: Evento[] = [];
  eventosFiltrados: Evento[] = []; // Array auxiliar para el buscador
  searchTerm: string = '';

  constructor(private eventoService: EventService) { }

  ngOnInit(): void {
    this.eventoService.obtenerEventosUsuario().subscribe(
      (eventos) => {
        // Mapeamos fechas
        this.eventos = eventos.map(evento => {
          return {
            ...evento,
            date: new Date(evento.date)
          };
        });
        // Inicializamos los filtrados con todos los eventos
        this.eventosFiltrados = this.eventos;
      },
      (error) => {
        console.error('Error al obtener eventos:', error);
      }
    );
  }

  // Lógica de búsqueda en tiempo real
  filtrarEventos() {
    if (!this.searchTerm) {
      this.eventosFiltrados = this.eventos;
    } else {
      const term = this.searchTerm.toLowerCase();
      this.eventosFiltrados = this.eventos.filter(e => 
        e.title.toLowerCase().includes(term) || 
        e.location.toLowerCase().includes(term)
      );
    }
  }

  // Verifica si el evento ya pasó
  isEventoPasado(fecha: Date | string): boolean {
    return new Date(fecha) < new Date();
  }

  editEvent(id: number): void {
    this.router.navigate([`edit-event/${id}`]);
  }

  borrarEvent(id: number): void {
    if(confirm('¿Estás seguro de que deseas eliminar este evento? Esta acción no se puede deshacer.')) {
        this.eventoService.borrarEvento(id).subscribe(
          () => {
            this.eventos = this.eventos.filter(evento => evento.id !== id);
            this.filtrarEventos(); // Actualizar la vista filtrada
          },
          (error) => {
            console.error('Error al borrar evento:', error);
          }
        );
    }
  }

  verEvento(id: number): void {
    this.router.navigate([`event/${id}`]);
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
import { Component, inject, OnInit } from '@angular/core';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';


@Component({
  selector: 'app-mis-eventos',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './mis-eventos.component.html',
  styleUrl: './mis-eventos.component.css'
})
export class MisEventosComponent implements OnInit {

  private router = inject(Router);

  eventos: Evento[] = [];

  constructor(private eventoService: EventService) { }

  ngOnInit(): void {
    this.eventoService.obtenerEventosUsuario().subscribe(

      (eventos) => {
        this.eventos = eventos;
        this.eventos = this.eventos.map(evento => {
          return {
            ...evento,
            date: new Date(evento.date)
          };
        });

      },
      (error) => {
        console.error('Error al obtener eventos:', error);
      }

    );

  }

  editEvent(id: number): void {
    this.router.navigate([`edit-event/${id}`]);
  }

  borrarEvent(id: number): void {
    this.eventoService.borrarEvento(id).subscribe(
      () => {
        this.eventos = this.eventos.filter(evento => evento.id !== id);
      },
      (error) => {
        console.error('Error al borrar evento:', error);
      }
    );
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
    this.eventos.sort((a, b) => a.title.localeCompare(b.title));
  }


  ordenarPorFecha(): void {
    this.eventos.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}



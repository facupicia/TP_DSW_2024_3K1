import { Component, inject, Input, OnInit } from '@angular/core';
import { EventService } from '../../services/event.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Evento } from '../../interfaces/event';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'app-detalle-evento',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './detalle-evento.component.html',
  styleUrl: './detalle-evento.component.css'
})
export class DetalleEventoComponent implements OnInit {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private eventoService = inject(EventService);
  private accesService = inject(AuthService);
  private eventId: string | null = null;

  isLoggedIn = false;
  user: any;
  evento: any;
  imgPerfil: string | null = null;
  loading = true;

  ngOnInit(): void {
    if (typeof localStorage !== 'undefined') {
      this.isLoggedIn = localStorage.getItem('token') !== null;
    }

    this.eventId = this.route.snapshot.paramMap.get('id');

    if (this.eventId) {
      this.loading = true; // Asegurar loading true al inicio

      this.eventoService.obtenerEvento(Number(this.eventId)).subscribe({
        next: (evento) => {
          this.evento = evento;
          // Solo obtenemos la imagen del usuario si el evento tiene user_id
          if (evento.user_id) {
            this.obtenerImagenUsuario(evento.user_id);
          }
          this.loading = false; // Loading false cuando tenemos datos
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
        }
      });
    }
  }

  addToCalendar() {
  const { title, description, location, date, time } = this.evento;
  
  // Formato de fechas para Google (YYYYMMDDTHHmmSS)
  // Nota: Esto es una aproximación básica. Idealmente usa librerías como 'date-fns'
  const startDate = new Date(date + 'T' + time);
  const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000)); // Asumimos 2 horas de duración
  
  const format = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
  
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}&dates=${format(startDate)}/${format(endDate)}`;
  
  window.open(googleUrl, '_blank');
}

  cargarEvento() {
    this.eventoService.obtenerEvento(Number(this.eventId)).subscribe(
      (data: Evento) => {
        this.evento = data;
        this.loading = false;
      },
      (error: any) => {
        console.error('Error al cargar el evento', error);
        this.loading = false;
      }
    );
  }

  shareEvent() {
  if (navigator.share) {
    navigator.share({
      title: this.evento.title,
      text: `¡Mira este evento! ${this.evento.title} en ${this.evento.location}`,
      url: window.location.href
    })
    .catch((error) => console.log('Error compartiendo', error));
  } else {
    // Fallback: Copiar al portapapeles
    navigator.clipboard.writeText(window.location.href);
    alert('Enlace copiado al portapapeles');
  }
}

  obtenerImagenUsuario(userId: number): void {
    this.accesService.obtenerImagenUsuario(userId).subscribe(
      (user) => {
        this.user = user;
        this.imgPerfil = user.imgPerfil;
      },
      (error) => {
        console.error('Error al obtener la imagen del usuario:', error);
      }
    );
  }

  reservarEntrada(eventId: number): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.router.navigate([`/ticket/${eventId}`]);
    } else {
      this.router.navigate(['/login']);
    }

  }



}
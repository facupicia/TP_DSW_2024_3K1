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
  // 1. Verificar Login
  if (typeof localStorage !== 'undefined') {
    this.isLoggedIn = !!localStorage.getItem('token'); // '!!' convierte a boolean
  }

  // 2. Obtener ID
  const idParam = this.route.snapshot.paramMap.get('id');
  this.eventId = idParam;

  // 3. Validar ID
  if (!this.eventId || isNaN(Number(this.eventId)) || Number(this.eventId) <= 0) {
    this.router.navigate(['/events']); // Mejor redirigir a /events que a home
    return;
  }

  // 4. Cargar datos
  this.cargarEvento(Number(this.eventId));
}

cargarEvento(id: number) {
  this.loading = true;
  this.eventoService.obtenerEvento(id).subscribe({
    next: (data) => {
      this.evento = data;
      // Cargar organizador si existe
      if (data.user_id) {
        this.obtenerImagenUsuario(data.user_id);
      }
      this.loading = false;
    },
    error: (err) => {
      console.error('Error:', err);
      this.loading = false;
      this.router.navigate(['/events']); // Redirigir si falla la carga
    }
  });
}

  // En tu clase DetalleEventoComponent
  getGoogleMapsUrl(location: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
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

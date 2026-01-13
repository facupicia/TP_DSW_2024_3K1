import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; // Importante para *ngIf
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { AuthService } from '../../services/auth.service';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [HeaderComponent, CommonModule],
  templateUrl: './perfil.component.html',
  // Ya no necesitamos styleUrl porque usamos Tailwind en el HTML
  // styleUrl: './perfil.component.css' 
})
export class PerfilComponent implements OnInit {
  userProfile: any = {};
  eventos: Evento[] = [];
  tieneEventos: boolean = false;
  esAdmin: boolean = false;
  esScanner: boolean = false;

  constructor(
    private profileService: AuthService,
    private router: Router,
    private eventoService: EventService
  ) { }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        this.profileService.getProfile().subscribe({
          next: (data) => {
            this.userProfile = data;
            this.verificarEventos();
          },
          error: (err) => {
            console.error('Error al obtener perfil:', err);
            this.router.navigate(['/login']);
          },
        });
      } else {
        this.router.navigate(['/login']);
      }
    }
  }
  verEstadisticas() {
    // Asegúrate de que esta sea la ruta que definiste en tu app.routes.ts
    // para el componente CreatorStatsComponent
    this.router.navigate(['creator/stats']);
  }

  verificarEventos() {
    this.eventoService.obtenerEventosUsuario().subscribe({
      next: (data) => {
        this.eventos = data;
        this.tieneEventos = data && data.length > 0;
      },
      error: (err) => {
        console.error('Error al obtener eventos:', err);
      },
    });
  }

  // --- Navegación ---
  panelAdmin() {
    this.router.navigate(['/admin']);
  }

  editProfile() {
    // Si tienes el ID en userProfile, úsalo. Si no, ajusta la ruta.
    if (this.userProfile.id) {
      this.router.navigate([`/profile/${this.userProfile.id}`]);
    }
  }

  showOrders() {
    if (this.userProfile.id) {
      this.router.navigate(['/my-tickets', this.userProfile.id]);
    }
  }

  misEventos() {
    this.router.navigate(['/my-events']);
  }

  irAlScanner() {
    this.router.navigate(['/scanner']);
  }

  logout() {
    this.profileService.logout();
    this.router.navigate(['/']);
  }
}
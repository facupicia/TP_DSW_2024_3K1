import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  private router = inject(Router)
  private accesService = inject(AuthService);
  user: any;
  evento: any;
  imgPerfil: string | null = null;



  ngOnInit(): void {
    this.accesService.currentUser$.subscribe(user => {
      this.user = user;
      this.imgPerfil = user?.imgPerfil;
    });
  }


  redirectToLogin(): void {
    this.router.navigate(['/login']);
  }

  redirectToRegister(): void {
    this.router.navigate(['/register']);
  }


  isLoggedIn = typeof localStorage !== 'undefined' && localStorage.getItem('token') !== null;
  showTooltip = false


  crearEvento(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        this.router.navigate(['/create-event']);
      } else {
        this.router.navigate(['/tickets']);
      }
    }
  }

  redirectToProfile() {
    this.router.navigate(['/profile']);
  }


  redirectToLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('cachedProfile');
    }
    this.accesService.logout(); // Limpiar estado reactivo
    this.router.navigate(['/']);
  }
}

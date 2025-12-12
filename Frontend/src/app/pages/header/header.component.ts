import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventServiceService } from '../../services/event.service.service';
import { AccesService } from '../../services/acces.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  private router = inject(Router)
  private accesService = inject(AccesService);
  user: any;
  evento: any;
  imgPerfil: string | null = null;



  ngOnInit(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.accesService.getProfile().subscribe(
        (user) => {
          this.user = user;
          this.imgPerfil = user?.imgPerfil; // Imagen por defecto si no hay
        },
      );
    }
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
    const token = localStorage.getItem('token');
    if (token) {
      this.router.navigate(['/create-event']);
    } else {
      this.router.navigate(['/tickets']);
    }
  }

  redirectToProfile() {
    this.router.navigate(['/profile']);
  }


  redirectToLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('cachedProfile');
    this.router.navigate(['/']);
  }


}

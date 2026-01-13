import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef, NgZone, Input } from '@angular/core';
import { Router, RouterModule } from '@angular/router'; // <--- IMPORTANTE: RouterModule
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule], // <--- AGREGAR AQUÍ
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnDestroy {
  router = inject(Router)
  private accesService = inject(AuthService);
  private cd = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  // Usaremos 'user' para el estado reactivo
  user$ = this.accesService.currentUser$;
  isMenuOpen = false;

  @Input() topOffset: string = '0';

  ngOnInit(): void {
    // Cerrar menú al cambiar de ruta
    this.router.events.subscribe(() => {
      this.isMenuOpen = false;
      this.manageScrollLock();
    });
  }

  // Función unificada para navegar y cerrar menú
  navigateMobile(path: string): void {
    this.isMenuOpen = false;
    this.manageScrollLock();
    this.router.navigate([path]);
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    this.manageScrollLock();
  }

  crearEvento(): void {
    // Para acciones puntuales, podemos ver el valor actual del BehaviorSubject desde el servicio si es público, 
    // o suscribirnos una vez. Aqui asumimos que currentUser$ viene de un BehaviorSubject.
    // O mejor, verificamos si hay token.
    const isAuthenticated = localStorage.getItem('token');
    const route = isAuthenticated ? '/create-event' : '/tickets';
    this.navigateMobile(route);
  }

  redirectToLogout() {
    this.accesService.logout();
    this.isMenuOpen = false;
    this.manageScrollLock();
    this.ngZone.run(() => {
      this.router.navigate(['/login']);
    });
  }

  redirectToProfile() {
    this.navigateMobile('/profile');
  }

  // ... Resto del código de scroll lock (igual)
  private manageScrollLock() {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = this.isMenuOpen ? 'hidden' : '';
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }
}

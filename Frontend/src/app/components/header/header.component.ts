import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';
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

  // Usaremos 'user' para el estado reactivo en lugar de la variable estática isLoggedIn
  user: any = null;
  isMenuOpen = false;

  ngOnInit(): void {
    this.accesService.currentUser$.subscribe(user => {
      this.user = user;
      this.cd.detectChanges(); // Forzar actualización de vista para asegurar reactividad inmediata
    });

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
    const route = this.user ? '/create-event' : '/tickets'; // Usamos this.user que es reactivo
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

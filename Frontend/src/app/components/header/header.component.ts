import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, OnInit, ChangeDetectorRef, NgZone, Input } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  router = inject(Router);
  private accesService = inject(AuthService);
  private cd = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private subscriptionService = inject(SubscriptionService);

  // Estado reactivo del usuario
  user$ = this.accesService.currentUser$;
  
  // Estados de UI
  isMenuOpen = false;
  scrolled = false; // Nuevo: Para el efecto glass dinámico

  // Estado de Suscripción
  subscription: UserSubscription | null = null;
  isPro = false;

  @Input() topOffset: string = '0';

  ngOnInit(): void {
    // Cerrar menú al navegar
    this.router.events.subscribe(() => {
      this.isMenuOpen = false;
      this.manageScrollLock();
    });

    // Cargar suscripción si hay usuario
    this.user$.subscribe(user => {
      if (user) {
        this.loadSubscription();
      } else {
        this.subscription = null;
        this.isPro = false;
      }
    });
  }

  // --- DETECCIÓN DE SCROLL (Efecto Apple) ---
  @HostListener('window:scroll', [])
  onWindowScroll() {
    // Si bajamos más de 10px, activamos el fondo glass
    this.scrolled = window.scrollY > 10;
  }

  private loadSubscription(): void {
    this.subscriptionService.getMySubscription().subscribe({
      next: (sub) => {
        this.subscription = sub;
        this.isPro = sub.plan?.name === 'PRO' && sub.status === 'active';
      },
      error: () => {
        this.subscription = null;
        this.isPro = false;
      }
    });
  }

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
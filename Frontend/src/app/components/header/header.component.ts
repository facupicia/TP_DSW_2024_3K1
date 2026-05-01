import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, OnInit, ChangeDetectorRef, NgZone, Input } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';
import { PromoterService } from '../../services/promoter.service';
import { EventService } from '../../services/event.service';
import { hasRoleLevel, hasExactRole } from '../../interfaces/Usuario';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-header',
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
  private promoterService = inject(PromoterService);
  private eventService = inject(EventService);

  // Estado reactivo del usuario
  user$ = this.accesService.currentUser$;
  
  // Estados de UI
  isMenuOpen = false;
  scrolled = false; // Nuevo: Para el efecto glass dinámico

  // Estado de Suscripción
  subscription: UserSubscription | null = null;
  isPro = false;

  // Estado de eventos del organizador
  hasEvents = false;
  private hasEventsChecked = false; // Evita llamadas repetidas

  // Suscripciones para cleanup
  private subscriptions: Subscription[] = [];

  @Input() topOffset: string = '0';

  ngOnInit(): void {
    // Cerrar menú al navegar
    const routerSub = this.router.events.subscribe(() => {
      this.isMenuOpen = false;
      this.manageScrollLock();
    });
    this.subscriptions.push(routerSub);

    // Cargar suscripción y verificar eventos UNA SOLA VEZ cuando hay usuario
    const userSub = this.user$.subscribe(user => {
      if (user) {
        this.loadSubscription();
        // Solo verificar eventos si es organizador y aún no verificamos
        const userRoles = user.roles || [user.rol] || ['user'];
        if (hasRoleLevel(userRoles, 'organizer') && !this.hasEventsChecked) {
          this.hasEventsChecked = true;
          this.checkHasEvents();
        }
      } else {
        this.subscription = null;
        this.isPro = false;
        this.hasEvents = false;
        this.hasEventsChecked = false; // Reset para cuando vuelva a loguear
      }
    });
    this.subscriptions.push(userSub);
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

  private checkHasEvents(): void {
    this.promoterService.checkHasEvents().subscribe({
      next: (result) => {
        this.hasEvents = result.hasEvents;
      },
      error: () => {
        this.hasEvents = false;
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
    // Limpiar todas las suscripciones
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  // ===== Role checking helpers =====
  
  hasOrganizerLevel(user: any): boolean {
    const roles = user?.roles || [user?.rol] || ['user'];
    return hasRoleLevel(roles, 'organizer');
  }
  
  isRrpp(user: any): boolean {
    const roles = user?.roles || [user?.rol] || ['user'];
    return hasExactRole(roles, 'rrpp');
  }
  
  isScanner(user: any): boolean {
    const roles = user?.roles || [user?.rol] || ['user'];
    return hasExactRole(roles, 'scanner');
  }

  /**
   * Obtiene las iniciales del usuario para el avatar
   * Ej: "Juan Perez" -> "JP"
   */
  getInitials(user: any): string {
    if (!user) return '?';
    const first = user.firstname?.charAt(0) || '';
    const last = user.lastname?.charAt(0) || '';
    return (first + last).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?';
  }
}
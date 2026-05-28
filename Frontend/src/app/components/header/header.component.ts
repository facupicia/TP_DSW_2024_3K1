import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, OnInit, ChangeDetectorRef, NgZone, Input, PLATFORM_ID } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';
import { PromoterService } from '../../services/promoter.service';
import { EventService } from '../../services/event.service';
import { CategoryService } from '../../services/category.service';

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
  private platformId = inject(PLATFORM_ID);
  private subscriptionService = inject(SubscriptionService);
  private promoterService = inject(PromoterService);
  private eventService = inject(EventService);
  private categoryService = inject(CategoryService);

  // Estado reactivo del usuario
  user$ = this.accesService.currentUser$;
  
  // Estados de UI
  isMenuOpen = false;
  categorias: string[] = [];
  scrolled = false; // Nuevo: Para el efecto glass dinámico

  // Estado de Suscripción
  subscription: UserSubscription | null = null;
  currentPlanName: string | null = null;

  get planBadge(): { text: string; class: string } | null {
    const name = this.currentPlanName?.toUpperCase();
    if (name === 'PRO') {
      return { text: 'PRO', class: 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' };
    }
    if (name === 'STARTER') {
      return { text: 'STARTER', class: 'bg-blue-600 text-white' };
    }
    if (name === 'FREE') {
      return { text: 'FREE', class: 'bg-gray-200 text-gray-600' };
    }
    return null;
  }

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

    // Estas operaciones dependen del browser (localStorage, backend disponible)
    // y deben saltarse durante SSR/prerender para evitar timeouts en el build
    if (isPlatformBrowser(this.platformId)) {
      this.loadCategories();

      // Cargar suscripción y verificar eventos UNA SOLA VEZ cuando hay usuario
      const userSub = this.user$.subscribe(user => {
        if (user) {
          this.loadSubscription();
          // Solo verificar eventos si es organizador y aún no verificamos
          const userRoles = user.roles || [user.rol] || ['user'];
          if ((userRoles.includes('organizer') || userRoles.includes('admin')) && !this.hasEventsChecked) {
            this.hasEventsChecked = true;
            this.checkHasEvents();
          }
        } else {
          this.subscription = null;
          this.currentPlanName = null;
          this.hasEvents = false;
          this.hasEventsChecked = false; // Reset para cuando vuelva a loguear
        }
      });
      this.subscriptions.push(userSub);
    }
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
        this.currentPlanName = sub.plan?.name || null;
      },
      error: () => {
        this.subscription = null;
        this.currentPlanName = null;
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

  navigateCategory(categoria: string): void {
    this.isMenuOpen = false;
    this.manageScrollLock();
    this.router.navigate(['/events'], { queryParams: { category: categoria } });
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    this.manageScrollLock();
  }

  crearEvento(): void {
    this.isMenuOpen = false;
    this.manageScrollLock();

    if (this.accesService.currentUserValue) {
      this.router.navigate(['/create-event']);
      return;
    }

    this.router.navigate(['/login'], { queryParams: { returnUrl: '/create-event' } });
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

  private loadCategories(): void {
    const categorySub = this.categoryService.getCategories().subscribe({
      next: (categorias) => {
        this.categorias = categorias.map(categoria => categoria.name);
      },
      error: () => {
        this.categorias = [];
      }
    });
    this.subscriptions.push(categorySub);
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
    return roles.includes('organizer') || roles.includes('admin');
  }

  isRrpp(user: any): boolean {
    const roles = user?.roles || [user?.rol] || ['user'];
    return roles.includes('rrpp');
  }

  isScanner(user: any): boolean {
    const roles = user?.roles || [user?.rol] || ['user'];
    return roles.includes('scanner');
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

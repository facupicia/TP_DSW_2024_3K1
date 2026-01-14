import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { AuthService } from '../../services/auth.service';
import { EventService } from '../../services/event.service';
// Importamos SubscriptionPlan
import { SubscriptionService, UserSubscription, SubscriptionPlan } from '../../services/subscription.service';
import { Evento } from '../../interfaces/event';
import { ToastService } from '../../services/toast.service'; // Inyectamos Toast

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [HeaderComponent, CommonModule],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})
export class PerfilComponent implements OnInit {
  // Inyecciones
  private profileService = inject(AuthService);
  private router = inject(Router);
  private eventoService = inject(EventService);
  public subscriptionService = inject(SubscriptionService); // Public para usar en HTML si hace falta
  private toast = inject(ToastService);

  userProfile: any = {};
  eventos: Evento[] = [];
  tieneEventos: boolean = false;
  esAdmin: boolean = false;
  esScanner: boolean = false;

  // Subscription info
  subscription: UserSubscription | null = null;
  isPro = false;
  planExpiresAt: Date | null = null;

  // --- LÓGICA DEL MODAL DE PAGO ---
  plans: SubscriptionPlan[] = [];
  selectedPlan: SubscriptionPlan | null = null;
  showBillingModal = false;
  loading = false;
  cancellingSubscription = false;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        this.profileService.getProfile().subscribe({
          next: (data) => {
            this.userProfile = data;
            this.verificarEventos();
            this.loadSubscription();
            this.loadPlans(); // Cargamos planes en segundo plano
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

  private loadSubscription(): void {
    this.subscriptionService.getMySubscription().subscribe({
      next: (sub) => {
        this.subscription = sub;
        this.isPro = sub.plan?.name === 'PRO' && sub.status === 'active';
        if (sub.currentPeriodEnd) {
          this.planExpiresAt = new Date(sub.currentPeriodEnd);
        }
      },
      error: (err) => console.error('Error al obtener suscripción:', err)
    });
  }

  // Cargamos los planes para tener el ID del plan PRO listo
  private loadPlans(): void {
    this.subscriptionService.getPlans().subscribe({
      next: (plans) => this.plans = plans,
      error: (err) => console.error('Error cargando planes', err)
    });
  }

  // --- ACCIÓN PRINCIPAL: ABRIR MODAL ---
  goToUpgrade(): void {
    // Buscamos el plan PRO (o el que tenga precio > 0)
    const proPlan = this.plans.find(p => p.name === 'PRO' || p.monthlyPrice > 0);

    if (proPlan) {
      this.selectedPlan = proPlan;
      this.showBillingModal = true;
    } else {
      this.toast.error('No se pudieron cargar los planes. Intenta más tarde.');
    }
  }

  closeBillingModal() {
    this.showBillingModal = false;
    this.selectedPlan = null;
  }

  // --- CHECKOUT CON MERCADO PAGO ---
  checkout(billingType: 'monthly' | 'yearly') {
    if (!this.selectedPlan) return;

    this.loading = true;

    this.subscriptionService.createCheckout(this.selectedPlan.id, billingType).subscribe({
      next: (response) => {
        this.loading = false;
        // Redirigir a Mercado Pago
        window.location.href = response.checkoutUrl;
      },
      error: (err) => {
        this.loading = false;
        this.closeBillingModal();
        this.toast.error(err?.error?.message || 'Error al iniciar el pago');
      }
    });
  }

  // --- CANCELAR SUSCRIPCIÓN ---
  cancelSubscription(): void {
    const confirmed = confirm(
      '¿Estás seguro de que querés cancelar tu suscripción PRO?\n\n' +
      'Tu plan se mantendrá activo hasta el fin del período actual. ' +
      'Después de eso, volverás al plan gratuito.'
    );

    if (!confirmed) return;

    this.cancellingSubscription = true;

    this.subscriptionService.cancelSubscription().subscribe({
      next: (response) => {
        this.cancellingSubscription = false;
        this.toast.success(response.message || 'Suscripción cancelada correctamente');
        // Recargar la info de suscripción
        this.loadSubscription();
      },
      error: (err) => {
        this.cancellingSubscription = false;
        this.toast.error(err?.error?.message || 'Error al cancelar la suscripción');
      }
    });
  }

  // --- Resto de métodos de navegación ---
  verEstadisticas() { this.router.navigate(['creator/stats']); }

  verificarEventos() {
    this.eventoService.obtenerEventosUsuario().subscribe({
      next: (data) => {
        this.eventos = data;
        this.tieneEventos = data && data.length > 0;
      },
      error: (err) => console.error(err),
    });
  }

  panelAdmin() { this.router.navigate(['/admin']); }

  editProfile() {
    if (this.userProfile.id) this.router.navigate([`/profile/${this.userProfile.id}`]);
  }

  showOrders() {
    if (this.userProfile.id) this.router.navigate(['/my-tickets', this.userProfile.id]);
  }

  misEventos() { this.router.navigate(['/my-events']); }
  irAlScanner() { this.router.navigate(['/scanner']); }

  logout() {
    this.profileService.logout();
    this.router.navigate(['/']);
  }
}
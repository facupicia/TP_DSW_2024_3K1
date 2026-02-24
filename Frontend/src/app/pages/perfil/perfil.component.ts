import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { UpgradeButtonComponent } from '../../components/upgrade-button/upgrade-button.component';
import { AuthService } from '../../services/auth.service';
import { EventService } from '../../services/event.service';
import { SubscriptionService, UserSubscription, SubscriptionPlan } from '../../services/subscription.service';
import { PaymentService, MpStatus } from '../../services/payment.service';
import { Evento } from '../../interfaces/event';
import { ToastService } from '../../services/toast.service';
import { hasExactRole, hasRoleLevel } from '../../interfaces/Usuario';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [HeaderComponent, CommonModule, UpgradeButtonComponent],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})
export class PerfilComponent implements OnInit {
  // Inyecciones
  private profileService = inject(AuthService);
  private router = inject(Router);
  private eventoService = inject(EventService);
  public subscriptionService = inject(SubscriptionService);
  private paymentService = inject(PaymentService);
  private toast = inject(ToastService);

  userProfile: any = {};
  eventos: Evento[] = [];
  tieneEventos: boolean = false;
  esAdmin: boolean = false;
  esScanner: boolean = false;
  esOrganizer: boolean = false;
  esRrpp: boolean = false;
  userRoles: string[] = [];

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

  // --- MERCADO PAGO MARKETPLACE ---
  mpStatus: MpStatus | null = null;
  mpLoading = false;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        this.profileService.getProfile().subscribe({
          next: (data) => {
            this.userProfile = data;
            // Support both new 'roles' array and legacy 'rol' field
            this.userRoles = data.roles || [data.rol] || ['user'];
            
            // Set role flags using helper functions
            this.esAdmin = hasExactRole(this.userRoles, 'admin');
            this.esScanner = hasExactRole(this.userRoles, 'scanner');
            this.esOrganizer = hasRoleLevel(this.userRoles, 'organizer');
            this.esRrpp = hasExactRole(this.userRoles, 'rrpp');
            
            this.verificarEventos();
            this.loadSubscription();
            this.loadPlans();
            this.loadMpStatus();
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

  // --- MERCADO PAGO MARKETPLACE ---
  private loadMpStatus(): void {
    if (!this.tieneEventos && !this.esOrganizer) return;

    this.paymentService.getMpStatus().subscribe({
      next: (status) => this.mpStatus = status,
      error: (err) => console.error('Error cargando estado MP:', err)
    });
  }

  connectMercadoPago(): void {
    this.mpLoading = true;
    this.paymentService.connectMercadoPago().subscribe({
      next: (response) => {
        this.mpLoading = false;
        window.location.href = response.authUrl;
      },
      error: (err) => {
        this.mpLoading = false;
        this.toast.error(err?.error?.message || 'Error al conectar Mercado Pago');
      }
    });
  }

  disconnectMercadoPago(): void {
    const confirmed = confirm(
      '¿Estás seguro de que querés desconectar tu cuenta de Mercado Pago?\n\n' +
      'Ya no podrás recibir pagos por tus eventos hasta que vuelvas a conectarla.'
    );

    if (!confirmed) return;

    this.mpLoading = true;
    this.paymentService.disconnectMercadoPago().subscribe({
      next: (response) => {
        this.mpLoading = false;
        this.mpStatus = { connected: false, mpUserId: null, expiresAt: null, needsReconnect: false };
        this.toast.success(response.message || 'Mercado Pago desconectado');
      },
      error: (err) => {
        this.mpLoading = false;
        this.toast.error(err?.error?.message || 'Error al desconectar Mercado Pago');
      }
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
  goToSettings() { this.router.navigate(['/settings']); }

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
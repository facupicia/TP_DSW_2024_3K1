import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionService, SubscriptionPlan, SubscriptionLimits } from '../../services/subscription.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service'; // Asumo que tienes esto

@Component({
    selector: 'app-subscription-landing',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './subscription-landing.component.html',
    styleUrls: ['./subscription-landing.component.css']
})
export class SubscriptionLandingComponent implements OnInit {
    public subscriptionService = inject(SubscriptionService);
    private authService = inject(AuthService); // Para verificar si está logueado
    private router = inject(Router);
    private toast = inject(ToastService);
    private platformId = inject(PLATFORM_ID);

    plans: SubscriptionPlan[] = [];
    currentLimits: SubscriptionLimits | null = null;

    // Estado del Modal y Checkout
    selectedPlan: SubscriptionPlan | null = null;
    showBillingModal = false;
    loading = false;
    isLoggedIn = false;

    ngOnInit() {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        this.checkLoginStatus();
        this.loadPlans();
    }

    checkLoginStatus() {
        // Guard against SSR (Server-Side Rendering)
        if (typeof window === 'undefined') {
            this.isLoggedIn = false;
            return;
        }

        const token = localStorage.getItem('token');
        this.isLoggedIn = !!token;

        if (this.isLoggedIn) {
            this.loadUserLimits();
        }
    }

    loadPlans() {
        // Limpiar caché para asegurar datos frescos
        this.subscriptionService.clearPlansCache();
        
        this.subscriptionService.getPlans(true).subscribe({
            next: (plans) => {

                // Ordenamos para que el PRO (o el más caro) quede segundo o destacado
                this.plans = plans.sort((a, b) => a.monthlyPrice - b.monthlyPrice);

                
                if (plans.length === 0) {
                    this.toast.warning('No hay planes de suscripción disponibles');
                }
            },
            error: (err) => {
                console.error('Error cargando planes:', err);
                this.plans = []; // Asegurar que planes esté vacío en error
                this.toast.error('Error al cargar los planes de suscripción');
            }
        });
    }

    loadUserLimits() {
        this.subscriptionService.getMyLimits().subscribe({
            next: (limits) => this.currentLimits = limits,
            error: (err) => console.error('Error cargando límites:', err)
        });
    }

    handlePlanAction(plan: SubscriptionPlan) {
        // 1. Si es el plan actual, no hacemos nada
        if (this.isCurrentPlan(plan.id)) return;

        // 2. Si no está logueado, mandamos a registrarse con un queryParam
        if (!this.isLoggedIn) {
            this.router.navigate(['/register'], { queryParams: { plan: plan.name } });
            return;
        }

        // 3. Si es gratuito (precio 0), es un downgrade o inicio simple
        if (plan.monthlyPrice === 0) {
            this.router.navigate(['/dashboard']); // O lógica de downgrade
            return;
        }

        // 4. Si es pago, abrimos el modal de facturación
        this.selectedPlan = plan;
        this.showBillingModal = true;
    }

    closeBillingModal() {
        this.showBillingModal = false;
        this.selectedPlan = null;
    }

    checkout(billingType: 'monthly' | 'yearly') {
        if (!this.selectedPlan) return;

        this.loading = true;
        // No cerramos el modal inmediatamente para mostrar estado de carga, o sí, decisión de UX
        // this.closeBillingModal(); 

        this.subscriptionService.createCheckout(this.selectedPlan.id, billingType).subscribe({
            next: (response) => {
                this.loading = false;
                if (response.success && response.checkoutUrl) {
                    window.location.href = response.checkoutUrl; // Redirección a MercadoPago
                } else {
                    this.closeBillingModal();
                    this.toast.error(response.message || 'Error al crear checkout');
                }
            },
            error: (err) => {
                this.loading = false;
                this.closeBillingModal();
                this.toast.error(err?.error?.message || 'Error al iniciar pago');
            }
        });
    }

    isCurrentPlan(planId: number): boolean {
        return this.currentLimits?.plan?.id === planId;
    }

    // Helper para saber si es el plan PRO (para estilos destacados)
    isPro(plan: SubscriptionPlan): boolean {
        // Puedes basarte en el nombre o en el precio > 0
        return plan.monthlyPrice > 0 || plan.name.toUpperCase().includes('PRO');
    }
}

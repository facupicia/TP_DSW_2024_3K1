import { Component, inject, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SubscriptionService, SubscriptionPlan } from '../../services/subscription.service';
import { ToastService } from '../../services/toast.service';

@Component({
    selector: 'app-upgrade-button',
    imports: [CommonModule],
    template: `
    <!-- Upgrade Button -->
    @if (!isPro) {
      <button (click)="openModal()" [class]="buttonClass">
        <ng-content></ng-content>
        @if (!hasContent) {
          <span>🚀 Mejorar a PRO</span>
        }
      </button>
    }
    
    <!-- Already PRO indicator -->
    @if (isPro && showProBadge) {
      <span
        class="px-3 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-full text-xs font-bold">
        ⭐ PRO
      </span>
    }
    
    <!-- Billing Modal -->
    @if (showBillingModal) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="closeModal()"></div>
        <div class="relative bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-scale-in">
          <div class="text-center mb-6">
            <h3 class="text-2xl font-bold text-gray-900 mb-2">Pasá al siguiente nivel</h3>
            <p class="text-gray-500">Seleccioná <strong class="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">{{ selectedPlan?.displayName }}</strong></p>
          </div>
          <div class="space-y-4">
            <button (click)="checkout('monthly')" [disabled]="loading"
              class="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-500 hover:bg-indigo-50 transition-all disabled:opacity-50">
              <div class="text-left">
                <span class="font-bold text-gray-900">Mensual</span>
                <span class="block text-xs text-gray-500">Facturación flexible</span>
              </div>
              <span class="font-bold text-xl text-gray-900">
                {{ selectedPlan?.monthlyPrice | currency:'USD':'symbol':'1.0-0' }}
              </span>
            </button>
            @if (selectedPlan?.yearlyPrice) {
              <button (click)="checkout('yearly')" [disabled]="loading"
                class="w-full relative flex items-center justify-between p-4 rounded-2xl border-2 border-green-100 bg-green-50/30 hover:border-green-500 hover:bg-green-50 transition-all disabled:opacity-50">
                <div class="absolute -top-3 left-4 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  AHORRA 2 MESES
                </div>
                <div class="text-left">
                  <span class="font-bold text-gray-900">Anual</span>
                  <span class="block text-xs text-gray-500">Un solo pago</span>
                </div>
                <div class="text-right">
                  <span class="block font-bold text-xl text-gray-900">
                    {{ selectedPlan?.yearlyPrice | currency:'USD':'symbol':'1.0-0' }}
                  </span>
                  <span class="text-[10px] text-green-600 font-bold">Mejor valor</span>
                </div>
              </button>
            }
          </div>
          <div class="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
            <button (click)="closeModal()" class="text-sm font-medium text-gray-400 hover:text-gray-600">
              Cancelar
            </button>
            @if (loading) {
              <div class="flex items-center gap-2 text-sm font-medium text-indigo-600">
                <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </div>
            }
            @if (!loading) {
              <span class="text-[10px] text-gray-400">Pagos seguros con MercadoPago</span>
            }
          </div>
        </div>
      </div>
    }
    `,
    styles: [`
    .animate-scale-in {
      animation: scaleIn 0.2s ease-out;
    }
    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `]
})
export class UpgradeButtonComponent implements OnInit {
    private subscriptionService = inject(SubscriptionService);
    private toast = inject(ToastService);

    @Input() isPro = false;
    @Input() showProBadge = false;
    @Input() buttonClass = 'px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-bold rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg active:scale-95';

    hasContent = false;
    plans: SubscriptionPlan[] = [];
    selectedPlan: SubscriptionPlan | null = null;
    showBillingModal = false;
    loading = false;

    ngOnInit(): void {
        this.loadPlans();
    }

    private loadPlans(): void {
        this.subscriptionService.getPlans().subscribe({
            next: (plans) => this.plans = plans,
            error: (err) => console.error('Error loading plans:', err)
        });
    }

    openModal(): void {
        const proPlan = this.plans.find(p => p.name === 'PRO' || p.monthlyPrice > 0);
        if (proPlan) {
            this.selectedPlan = proPlan;
            this.showBillingModal = true;
        } else {
            this.toast.error('No se pudieron cargar los planes.');
        }
    }

    closeModal(): void {
        this.showBillingModal = false;
        this.selectedPlan = null;
    }

    checkout(billingType: 'monthly' | 'yearly'): void {
        if (!this.selectedPlan) return;
        this.loading = true;

        this.subscriptionService.createCheckout(this.selectedPlan.id, billingType).subscribe({
            next: (response) => {
                this.loading = false;
                window.location.href = response.checkoutUrl;
            },
            error: (err) => {
                this.loading = false;
                this.closeModal();
                this.toast.error(err?.error?.message || 'Error al iniciar el pago');
            }
        });
    }
}

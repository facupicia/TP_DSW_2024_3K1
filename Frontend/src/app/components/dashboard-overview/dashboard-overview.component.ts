import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverviewResponse } from '../../services/admin.service';
import { KpiCardComponent, KpiCardData } from '../kpi-card/kpi-card.component';
import { CurrencyFormatterPipe, PercentFormatterPipe } from '../../pipes/formatter.pipes';

@Component({
    selector: 'app-dashboard-overview',
    standalone: true,
    imports: [CommonModule, KpiCardComponent, CurrencyFormatterPipe, PercentFormatterPipe],
    template: `
    <div *ngIf="loading" class="kpi-grid">
      <div *ngFor="let i of [1,2,3,4,5,6]" class="kpi-card">
        <div class="h-24 bg-gray-100 animate-pulse rounded-xl"></div>
      </div>
    </div>

    <div *ngIf="!loading && overview">
      <!-- Executive Metrics -->
      <div class="kpi-grid">
        <app-kpi-card *ngFor="let card of kpiCards" [data]="card"></app-kpi-card>
      </div>

      <!-- Quick Stats Grid -->
      <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Top Organizers -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 class="text-lg font-bold text-gray-900 mb-4">🏆 Top Organizadores (Comisiones)</h3>
          <div class="space-y-3">
            <div *ngFor="let org of overview.commissions.topOrganizers.slice(0, 5)" 
                 class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div class="flex-1">
                <p class="font-bold text-gray-900 text-sm">{{ org.organizerName }}</p>
                <p class="text-xs text-gray-500">{{ org.salesCount }} ventas</p>
              </div>
              <div class="text-right">
                <p class="font-bold text-green-600">{{ org.totalCommission | currency }}</p>
                <p class="text-xs text-gray-500">GMV: {{ org.totalGmv | currency }}</p>
              </div>
            </div>
            <p *ngIf="overview.commissions.topOrganizers.length === 0" 
               class="text-gray-400 text-sm text-center py-4">
              No hay datos disponibles
            </p>
          </div>
        </div>

        <!-- Subscription Breakdown -->
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 class="text-lg font-bold text-gray-900 mb-4">📊 Distribución de Suscripciones</h3>
          <div class="space-y-3">
            <div *ngFor="let plan of overview.subscriptions.activeSubscriptions.byPlan" 
                 class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center"
                  [class.bg-purple-100]="plan.planName === 'PRO'"
                  [class.text-purple-600]="plan.planName === 'PRO'"
                  [class.bg-gray-100]="plan.planName === 'FREE'"
                  [class.text-gray-600]="plan.planName === 'FREE'">
                  <span class="font-bold text-sm">{{ plan.planName.charAt(0) }}</span>
                </div>
                <div>
                  <p class="font-bold text-gray-900 text-sm">{{ plan.displayName || plan.planName }}</p>
                  <p class="text-xs text-gray-500">
                    {{ ((plan.count / overview.subscriptions.activeSubscriptions.total) * 100).toFixed(1) }}%
                  </p>
                </div>
              </div>
              <p class="text-2xl font-bold text-gray-900">{{ plan.count }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
    }
  `]
})
export class DashboardOverviewComponent {
    @Input() overview: OverviewResponse | null = null;
    @Input() loading = false;

    get kpiCards(): KpiCardData[] {
        if (!this.overview) return [];

        const currencyPipe = new CurrencyFormatterPipe();
        const percentPipe = new PercentFormatterPipe();

        return [
            {
                title: 'Ingresos Totales',
                value: currencyPipe.transform(this.overview.revenue.totalRevenue),
                subtitle: 'Comisiones + Suscripciones',
                icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                gradient: 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-100',
                textColor: 'green-700'
            },
            {
                title: 'Comisiones',
                value: currencyPipe.transform(this.overview.commissions.totalCommission),
                subtitle: percentPipe.transform(this.overview.commissions.averageCommissionPercent) + ' promedio',
                icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
                gradient: 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100',
                textColor: 'blue-700'
            },
            {
                title: 'Suscripciones',
                value: this.overview.subscriptions.activeSubscriptions.total.toString(),
                subtitle: 'MRR: ' + currencyPipe.transform(this.overview.subscriptions.mrr),
                icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
                gradient: 'bg-gradient-to-br from-purple-50 to-violet-50 border-purple-100',
                textColor: 'purple-700'
            },
            {
                title: 'GMV',
                value: currencyPipe.transform(this.overview.revenue.gmv),
                subtitle: this.overview.marketplace.ticketsSold + ' tickets vendidos',
                icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
                gradient: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100',
                textColor: 'amber-700'
            },
            {
                title: 'Usuarios PRO',
                value: this.overview.subscriptions.proUsers.toString(),
                subtitle: this.overview.subscriptions.freeUsers + ' FREE',
                icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
                gradient: 'bg-gradient-to-br from-cyan-50 to-sky-50 border-cyan-100',
                textColor: 'cyan-700'
            },
            {
                title: 'Eventos Activos',
                value: this.overview.events.activeEvents.toString(),
                subtitle: this.overview.events.featuredEvents + ' destacados',
                icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
                gradient: 'bg-gradient-to-br from-pink-50 to-rose-50 border-pink-100',
                textColor: 'pink-700'
            }
        ];
    }
}

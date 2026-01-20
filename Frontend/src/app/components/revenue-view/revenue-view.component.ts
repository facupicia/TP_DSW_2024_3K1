import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverviewResponse } from '../../services/admin.service';
import { CurrencyFormatterPipe, PercentFormatterPipe } from '../../pipes/formatter.pipes';

@Component({
    selector: 'app-revenue-view',
    standalone: true,
    imports: [CommonModule, CurrencyFormatterPipe],
    template: `
    <div *ngIf="loading" class="p-8 text-center">
      <div class="h-32 bg-gray-100 animate-pulse rounded-xl"></div>
    </div>
    
    <div *ngIf="!loading && overview" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p class="text-sm text-gray-500 uppercase font-bold tracking-wider mb-2">Ingresos Totales</p>
          <p class="text-3xl font-bold text-gray-900">{{ overview.revenue.totalRevenue | currency }}</p>
        </div>
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p class="text-sm text-gray-500 uppercase font-bold tracking-wider mb-2">Comisiones</p>
          <p class="text-3xl font-bold text-blue-600">{{ overview.revenue.commissionRevenue | currency }}</p>
        </div>
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p class="text-sm text-gray-500 uppercase font-bold tracking-wider mb-2">MRR (Suscripciones)</p>
          <p class="text-3xl font-bold text-purple-600">{{ overview.revenue.subscriptionRevenue | currency }}</p>
        </div>
      </div>
    </div>
  `
})
export class RevenueViewComponent {
    @Input() overview: OverviewResponse | null = null;
    @Input() loading = false;
}

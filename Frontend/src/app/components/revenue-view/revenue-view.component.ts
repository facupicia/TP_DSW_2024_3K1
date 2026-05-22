import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { OverviewResponse } from '../../services/admin.service';
import { TrendChartComponent } from '../trend-chart/trend-chart.component';
import { CurrencyFormatterPipe } from '../../pipes/formatter.pipes';

@Component({
    selector: 'app-revenue-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, NgApexchartsModule, TrendChartComponent, CurrencyFormatterPipe],
    template: `
    @if (loading) {
      <div class="p-8 text-center">
        <div class="h-32 bg-gray-100 animate-pulse rounded-xl"></div>
      </div>
    }
    
    @if (!loading && overview) {
      <div class="space-y-6">
        <!-- Revenue Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="revenue-card total">
            <div class="card-icon">💰</div>
            <div class="card-content">
              <p class="card-label">Ingresos Totales</p>
              <p class="card-value">{{ overview.revenue.totalRevenue | currency }}</p>
              <p class="card-subtitle">Todas las fuentes</p>
            </div>
          </div>
          <div class="revenue-card commission">
            <div class="card-icon">📊</div>
            <div class="card-content">
              <p class="card-label">Comisiones</p>
              <p class="card-value">{{ overview.revenue.commissionRevenue | currency }}</p>
              <p class="card-subtitle">{{ getCommissionPercentage() }}% de ingresos</p>
            </div>
          </div>
          <div class="revenue-card subscription">
            <div class="card-icon">⭐</div>
            <div class="card-content">
              <p class="card-label">MRR Suscripciones</p>
              <p class="card-value">{{ overview.revenue.subscriptionRevenue | currency }}</p>
              <p class="card-subtitle">{{ getSubscriptionPercentage() }}% de ingresos</p>
            </div>
          </div>
          <div class="revenue-card gmv">
            <div class="card-icon">🎫</div>
            <div class="card-content">
              <p class="card-label">GMV Total</p>
              <p class="card-value">{{ overview.revenue.gmv | currency }}</p>
              <p class="card-subtitle">Valor bruto mercancía</p>
            </div>
          </div>
        </div>
        <!-- Revenue Trend Chart -->
        <app-trend-chart
          [config]="{ title: '📈 Evolución de Ingresos', showSelector: true, height: 350, showLegend: true }">
        </app-trend-chart>
        <!-- Extras Metrics Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="revenue-card" style="border-left: 4px solid #F97316;">
            <div class="card-icon">🛍️</div>
            <div class="card-content">
              <p class="card-label">Extras Vendidos</p>
              <p class="card-value">{{ overview.marketplace.extrasSold }}</p>
              <p class="card-subtitle">{{ overview.extras.voucherStatus.used }} canjeados</p>
            </div>
          </div>
          <div class="revenue-card" style="border-left: 4px solid #FB923C;">
            <div class="card-icon">💎</div>
            <div class="card-content">
              <p class="card-label">Revenue Extras</p>
              <p class="card-value">{{ overview.marketplace.extrasRevenue | currency }}</p>
              <p class="card-subtitle">{{ getExtrasOfGmvPercentage() }}% del GMV</p>
            </div>
          </div>
          <div class="revenue-card" style="border-left: 4px solid #FBBF24;">
            <div class="card-icon">📦</div>
            <div class="card-content">
              <p class="card-label">Items Totales</p>
              <p class="card-value">{{ overview.marketplace.totalItemsSold }}</p>
              <p class="card-subtitle">Tickets + Extras</p>
            </div>
          </div>
          <div class="revenue-card" style="border-left: 4px solid #A3E635;">
            <div class="card-icon">🎯</div>
            <div class="card-content">
              <p class="card-label">Canje Extras</p>
              <p class="card-value">{{ getExtrasRedemptionRate() }}%</p>
              <p class="card-subtitle">{{ overview.extras.voucherStatus.active }} activos</p>
            </div>
          </div>
        </div>
        <!-- Breakdown Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Revenue Breakdown Donut -->
          <div class="breakdown-card">
            <h3 class="breakdown-title">💡 Desglose de Ingresos</h3>
            <div class="donut-container">
              @if (breakdownDonutOptions) {
                <apx-chart
                  [series]="breakdownDonutOptions.series"
                  [chart]="breakdownDonutOptions.chart"
                  [labels]="breakdownDonutOptions.labels"
                  [colors]="breakdownDonutOptions.colors"
                  [plotOptions]="breakdownDonutOptions.plotOptions"
                  [legend]="breakdownDonutOptions.legend"
                  [dataLabels]="breakdownDonutOptions.dataLabels">
                </apx-chart>
              }
            </div>
            <div class="breakdown-legend">
              <div class="legend-item">
                <span class="legend-dot commission"></span>
                <span class="legend-label">Comisiones</span>
                <span class="legend-value">{{ overview.revenue.commissionRevenue | currency }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot subscription"></span>
                <span class="legend-label">Suscripciones</span>
                <span class="legend-value">{{ overview.revenue.subscriptionRevenue | currency }}</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot extras"></span>
                <span class="legend-label">Extras</span>
                <span class="legend-value">{{ overview.marketplace.extrasRevenue | currency }}</span>
              </div>
            </div>
          </div>
          <!-- Key Metrics -->
          <div class="breakdown-card">
            <h3 class="breakdown-title">🎯 Métricas Clave del Marketplace</h3>
            <div class="metrics-grid">
              <div class="metric-item">
                <p class="metric-value blue">{{ overview.marketplace.ticketsSold }}</p>
                <p class="metric-label">Tickets Vendidos</p>
              </div>
              <div class="metric-item">
                <p class="metric-value purple">{{ overview.marketplace.totalTransactions }}</p>
                <p class="metric-label">Transacciones</p>
              </div>
              <div class="metric-item">
                <p class="metric-value green">{{ overview.marketplace.averageTicketPrice | currency }}</p>
                <p class="metric-label">Precio Promedio</p>
              </div>
              <div class="metric-item">
                <p class="metric-value amber">{{ getCommissionRate() }}%</p>
                <p class="metric-label">Tasa Comisión</p>
              </div>
            </div>
            <!-- Success Rate Bar -->
            <div class="success-rate-section">
              <div class="success-header">
                <span class="success-label">Tasa de Éxito de Pagos</span>
                <span class="success-value">{{ getSuccessRate() }}%</span>
              </div>
              <div class="success-bar">
                <div class="success-bar-fill" [style.width.%]="getSuccessRate()"></div>
              </div>
              <div class="success-stats">
                <span class="success-stat positive">✓ {{ overview.marketplace.successfulPayments }} exitosos</span>
                <span class="success-stat negative">✗ {{ overview.marketplace.failedPayments }} fallidos</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
    `,
    styles: [`
    .revenue-card {
      background: white;
      border-radius: 1.5rem;
      border: 1px solid #f3f4f6;
      padding: 1.5rem;
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .revenue-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.1);
    }

    .revenue-card.total { border-left: 4px solid #10B981; }
    .revenue-card.commission { border-left: 4px solid #3B82F6; }
    .revenue-card.subscription { border-left: 4px solid #8B5CF6; }
    .revenue-card.gmv { border-left: 4px solid #F59E0B; }

    .card-icon {
      font-size: 1.5rem;
      line-height: 1;
    }

    .card-content {
      flex: 1;
    }

    .card-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
      margin: 0 0 0.5rem 0;
    }

    .card-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #111827;
      margin: 0 0 0.25rem 0;
    }

    .card-subtitle {
      font-size: 0.75rem;
      color: #9ca3af;
      margin: 0;
    }

    .breakdown-card {
      background: white;
      border-radius: 1.5rem;
      border: 1px solid #f3f4f6;
      padding: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }

    .breakdown-title {
      font-size: 1rem;
      font-weight: 700;
      color: #111827;
      margin: 0 0 1.5rem 0;
    }

    .donut-container {
      display: flex;
      justify-content: center;
      margin-bottom: 1rem;
    }

    .breakdown-legend {
      display: flex;
      justify-content: center;
      gap: 2rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .legend-dot.commission { background: #3B82F6; }
    .legend-dot.subscription { background: #8B5CF6; }
    .legend-dot.extras { background: #F59E0B; }

    .legend-label {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .legend-value {
      font-weight: 700;
      color: #111827;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .metric-item {
      text-align: center;
      padding: 1rem;
      background: #f9fafb;
      border-radius: 1rem;
    }

    .metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 0.25rem 0;
    }

    .metric-value.blue { color: #3B82F6; }
    .metric-value.purple { color: #8B5CF6; }
    .metric-value.green { color: #10B981; }
    .metric-value.amber { color: #F59E0B; }

    .metric-label {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
      margin: 0;
    }

    .success-rate-section {
      padding: 1rem;
      background: #f9fafb;
      border-radius: 1rem;
    }

    .success-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .success-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
    }

    .success-value {
      font-size: 1rem;
      font-weight: 700;
      color: #10B981;
    }

    .success-bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.75rem;
    }

    .success-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #10B981, #34D399);
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .success-stats {
      display: flex;
      justify-content: space-between;
    }

    .success-stat {
      font-size: 0.75rem;
      font-weight: 600;
    }

    .success-stat.positive { color: #10B981; }
    .success-stat.negative { color: #EF4444; }
  `]
})
export class RevenueViewComponent {
  @Input() overview: OverviewResponse | null = null;
  @Input() loading = false;

  get breakdownDonutOptions(): any {
    if (!this.overview) return null;

    return {
      series: [
        this.overview.revenue.commissionRevenue,
        this.overview.revenue.subscriptionRevenue,
        this.overview.marketplace.extrasRevenue
      ],
      chart: {
        type: 'donut',
        height: 250,
        fontFamily: 'inherit'
      },
      labels: ['Comisiones', 'Suscripciones', 'Extras'],
      colors: ['#3B82F6', '#8B5CF6', '#F59E0B'],
      plotOptions: {
        pie: {
          donut: {
            size: '65%',
            labels: {
              show: true,
              name: { show: true, fontSize: '14px', fontWeight: 600 },
              value: {
                show: true,
                fontSize: '20px',
                fontWeight: 700,
                formatter: (val: number) => this.formatCurrency(val)
              },
              total: {
                show: true,
                label: 'Total',
                fontSize: '12px',
                color: '#6B7280',
                formatter: () => this.formatCurrency(this.overview!.revenue.totalRevenue)
              }
            }
          }
        }
      },
      legend: { show: false },
      dataLabels: { enabled: false }
    };
  }

  getExtrasOfGmvPercentage(): string {
    if (!this.overview || this.overview.revenue.gmv === 0) return '0';
    return ((this.overview.marketplace.extrasRevenue / this.overview.revenue.gmv) * 100).toFixed(1);
  }

  getExtrasRedemptionRate(): number {
    if (!this.overview) return 0;
    const total = this.overview.extras.voucherStatus.active + this.overview.extras.voucherStatus.used + this.overview.extras.voucherStatus.cancelled;
    if (total === 0) return 0;
    return Math.round((this.overview.extras.voucherStatus.used / total) * 100);
  }

  getCommissionPercentage(): string {
    if (!this.overview || this.overview.revenue.totalRevenue === 0) return '0';
    return ((this.overview.revenue.commissionRevenue / this.overview.revenue.totalRevenue) * 100).toFixed(0);
  }

  getSubscriptionPercentage(): string {
    if (!this.overview || this.overview.revenue.totalRevenue === 0) return '0';
    return ((this.overview.revenue.subscriptionRevenue / this.overview.revenue.totalRevenue) * 100).toFixed(0);
  }

  getCommissionRate(): string {
    if (!this.overview) return '0';
    return this.overview.commissions.averageCommissionPercent.toFixed(1);
  }

  getSuccessRate(): number {
    if (!this.overview) return 0;
    const total = this.overview.marketplace.successfulPayments + this.overview.marketplace.failedPayments;
    if (total === 0) return 100;
    return Math.round((this.overview.marketplace.successfulPayments / total) * 100);
  }

  private formatCurrency(value: number): string {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  }
}

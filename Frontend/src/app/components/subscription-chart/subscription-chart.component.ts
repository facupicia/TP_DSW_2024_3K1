import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { SubscriptionMetrics } from '../../services/admin.service';
import { CurrencyFormatterPipe } from '../../pipes/formatter.pipes';

@Component({
    selector: 'app-subscription-chart',
    standalone: true,
    imports: [CommonModule, NgApexchartsModule, CurrencyFormatterPipe],
    template: `
    <div class="charts-grid" *ngIf="metrics">
      <!-- Donut Chart - Plan Distribution -->
      <div class="chart-card">
        <h3 class="chart-card-title">
          <span class="title-icon">📊</span>
          Distribución de Planes
        </h3>
        <div class="donut-wrapper">
          <apx-chart
            *ngIf="donutOptions"
            [series]="donutOptions.series"
            [chart]="donutOptions.chart"
            [labels]="donutOptions.labels"
            [colors]="donutOptions.colors"
            [plotOptions]="donutOptions.plotOptions"
            [legend]="donutOptions.legend"
            [dataLabels]="donutOptions.dataLabels"
            [responsive]="donutOptions.responsive">
          </apx-chart>
        </div>
        <div class="plan-stats">
          <div *ngFor="let plan of metrics.activeSubscriptions.byPlan" class="plan-stat">
            <div class="plan-dot" [class.pro]="plan.planName === 'PRO'" [class.free]="plan.planName === 'FREE'"></div>
            <span class="plan-name">{{ plan.displayName || plan.planName }}</span>
            <span class="plan-count">{{ plan.count }}</span>
          </div>
        </div>
      </div>

      <!-- MRR & Churn Stats -->
      <div class="chart-card metrics-card">
        <h3 class="chart-card-title">
          <span class="title-icon">💰</span>
          Métricas Clave
        </h3>

        <div class="metric-block">
          <div class="metric-header">
            <span class="metric-label">MRR (Ingresos Recurrentes)</span>
            <span class="metric-badge mrr">Mensual</span>
          </div>
          <p class="metric-value mrr-value">{{ metrics.mrr | currency }}</p>
          <div class="metric-bar">
            <div class="metric-bar-fill mrr-bar" [style.width.%]="100"></div>
          </div>
        </div>

        <div class="metric-block">
          <div class="metric-header">
            <span class="metric-label">Tasa de Churn</span>
            <span class="metric-badge" [class.good]="metrics.churnRate < 5" [class.warning]="metrics.churnRate >= 5 && metrics.churnRate < 10" [class.bad]="metrics.churnRate >= 10">
              {{ metrics.churnRate < 5 ? 'Saludable' : (metrics.churnRate < 10 ? 'Atención' : 'Crítico') }}
            </span>
          </div>
          <p class="metric-value" [class.good-text]="metrics.churnRate < 5" [class.warning-text]="metrics.churnRate >= 5 && metrics.churnRate < 10" [class.bad-text]="metrics.churnRate >= 10">
            {{ metrics.churnRate.toFixed(1) }}%
          </p>
          <div class="churn-gauge">
            <apx-chart
              *ngIf="gaugeOptions"
              [series]="gaugeOptions.series"
              [chart]="gaugeOptions.chart"
              [plotOptions]="gaugeOptions.plotOptions"
              [colors]="gaugeOptions.colors"
              [labels]="gaugeOptions.labels">
            </apx-chart>
          </div>
        </div>

        <div class="conversion-stats">
          <div class="conversion-item">
            <span class="conversion-label">Usuarios PRO</span>
            <span class="conversion-value pro">{{ metrics.proUsers }}</span>
          </div>
          <div class="conversion-item">
            <span class="conversion-label">Usuarios FREE</span>
            <span class="conversion-value free">{{ metrics.freeUsers }}</span>
          </div>
          <div class="conversion-item">
            <span class="conversion-label">Tasa Conversión</span>
            <span class="conversion-value">{{ getConversionRate() }}%</span>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 1.5rem;
    }

    .chart-card {
      background: white;
      border-radius: 1.5rem;
      border: 1px solid #f3f4f6;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      padding: 1.5rem;
    }

    .chart-card-title {
      font-size: 1rem;
      font-weight: 700;
      color: #111827;
      margin: 0 0 1.5rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .title-icon {
      font-size: 1.25rem;
    }

    .donut-wrapper {
      display: flex;
      justify-content: center;
      margin-bottom: 1rem;
    }

    .plan-stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
    }

    .plan-stat {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .plan-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #9ca3af;
    }

    .plan-dot.pro { background: #8B5CF6; }
    .plan-dot.free { background: #6B7280; }

    .plan-name {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .plan-count {
      font-weight: 700;
      color: #111827;
    }

    .metrics-card {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .metric-block {
      padding: 1rem;
      background: #f9fafb;
      border-radius: 1rem;
    }

    .metric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .metric-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .metric-badge {
      font-size: 0.625rem;
      font-weight: 700;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      text-transform: uppercase;
    }

    .metric-badge.mrr { background: #DBEAFE; color: #1D4ED8; }
    .metric-badge.good { background: #D1FAE5; color: #047857; }
    .metric-badge.warning { background: #FEF3C7; color: #B45309; }
    .metric-badge.bad { background: #FEE2E2; color: #B91C1C; }

    .metric-value {
      font-size: 2rem;
      font-weight: 700;
      color: #111827;
      margin: 0;
    }

    .mrr-value { color: #2563EB; }
    .good-text { color: #059669; }
    .warning-text { color: #D97706; }
    .bad-text { color: #DC2626; }

    .metric-bar {
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      margin-top: 0.75rem;
      overflow: hidden;
    }

    .metric-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease;
    }

    .mrr-bar { background: linear-gradient(90deg, #3B82F6, #8B5CF6); }

    .churn-gauge {
      margin-top: 0.5rem;
      display: flex;
      justify-content: center;
    }

    .conversion-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      padding-top: 0.5rem;
    }

    .conversion-item {
      text-align: center;
      padding: 0.75rem;
      background: #f9fafb;
      border-radius: 0.75rem;
    }

    .conversion-label {
      display: block;
      font-size: 0.625rem;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }

    .conversion-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #111827;
    }

    .conversion-value.pro { color: #8B5CF6; }
    .conversion-value.free { color: #6B7280; }
  `]
})
export class SubscriptionChartComponent {
    @Input() metrics: SubscriptionMetrics | null = null;

    get donutOptions(): any {
        if (!this.metrics) return null;

        const plans = this.metrics.activeSubscriptions.byPlan;
        return {
            series: plans.map(p => p.count),
            chart: {
                type: 'donut',
                height: 220,
                fontFamily: 'inherit'
            },
            labels: plans.map(p => p.displayName || p.planName),
            colors: plans.map(p => p.planName === 'PRO' ? '#8B5CF6' : '#6B7280'),
            plotOptions: {
                pie: {
                    donut: {
                        size: '70%',
                        labels: {
                            show: true,
                            name: { show: true, fontSize: '14px', fontWeight: 600 },
                            value: { show: true, fontSize: '24px', fontWeight: 700 },
                            total: {
                                show: true,
                                label: 'Total',
                                fontSize: '12px',
                                color: '#6B7280'
                            }
                        }
                    }
                }
            },
            legend: { show: false },
            dataLabels: { enabled: false },
            responsive: [{
                breakpoint: 480,
                options: {
                    chart: { width: 200 }
                }
            }]
        };
    }

    get gaugeOptions(): any {
        if (!this.metrics) return null;

        const churnRate = Math.min(this.metrics.churnRate, 100);
        const color = churnRate < 5 ? '#10B981' : (churnRate < 10 ? '#F59E0B' : '#EF4444');

        return {
            series: [churnRate],
            chart: {
                type: 'radialBar',
                height: 120,
                sparkline: { enabled: true }
            },
            plotOptions: {
                radialBar: {
                    startAngle: -90,
                    endAngle: 90,
                    track: { background: '#e7e7e7', strokeWidth: '97%' },
                    dataLabels: { show: false }
                }
            },
            colors: [color],
            labels: ['Churn']
        };
    }

    getConversionRate(): string {
        if (!this.metrics) return '0';
        const total = this.metrics.proUsers + this.metrics.freeUsers;
        if (total === 0) return '0';
        return ((this.metrics.proUsers / total) * 100).toFixed(1);
    }
}

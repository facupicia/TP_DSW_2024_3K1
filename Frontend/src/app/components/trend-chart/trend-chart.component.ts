import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, OnChanges, SimpleChanges, inject, Output, EventEmitter } from '@angular/core';

import { NgApexchartsModule } from 'ng-apexcharts';
import { AdminService, TrendDataPoint } from '../../services/admin.service';

export type TrendPeriod = 'day' | 'week' | 'month';

export interface TrendChartConfig {
    title?: string;
    showSelector?: boolean;
    height?: number;
    showLegend?: boolean;
}

@Component({
    selector: 'app-trend-chart',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgApexchartsModule],
    template: `
    <div class="trend-chart-container">
      <!-- Header -->
      @if (config.title || config.showSelector) {
        <div class="chart-header">
          @if (config.title) {
            <h3 class="chart-title">{{ config.title }}</h3>
          }
          @if (config.showSelector) {
            <div class="period-selector">
              @for (p of periods; track p) {
                <button
                  [class.active]="selectedPeriod === p.value"
                  (click)="changePeriod(p.value)"
                  class="period-btn">
                  {{ p.label }}
                </button>
              }
            </div>
          }
        </div>
      }
    
      <!-- Loading State -->
      @if (loading) {
        <div class="chart-loading">
          <div class="loading-shimmer"></div>
        </div>
      }
    
      <!-- Chart -->
      @if (!loading && chartOptions) {
        <div class="chart-wrapper">
          <apx-chart
            [series]="chartOptions.series"
            [chart]="chartOptions.chart"
            [xaxis]="chartOptions.xaxis"
            [yaxis]="chartOptions.yaxis"
            [stroke]="chartOptions.stroke"
            [fill]="chartOptions.fill"
            [colors]="chartOptions.colors"
            [tooltip]="chartOptions.tooltip"
            [legend]="chartOptions.legend"
            [grid]="chartOptions.grid"
            [dataLabels]="chartOptions.dataLabels">
          </apx-chart>
        </div>
      }
    
      <!-- Empty State -->
      @if (!loading && (!trendData || trendData.length === 0)) {
        <div class="chart-empty">
          <svg class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>No hay datos disponibles para el período seleccionado</p>
          </div>
        }
      </div>
    `,
    styles: [`
    .trend-chart-container {
      background: white;
      border-radius: 1.5rem;
      border: 1px solid #f3f4f6;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      padding: 1.5rem;
      margin-top: 1.5rem;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .chart-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #111827;
      margin: 0;
    }

    .period-selector {
      display: flex;
      gap: 0.5rem;
      background: #f3f4f6;
      padding: 0.25rem;
      border-radius: 0.75rem;
    }

    .period-btn {
      padding: 0.5rem 1rem;
      border: none;
      background: transparent;
      border-radius: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .period-btn:hover {
      color: #111827;
    }

    .period-btn.active {
      background: white;
      color: #111827;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .chart-loading {
      height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .loading-shimmer {
      width: 100%;
      height: 250px;
      background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%);
      background-size: 400% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 1rem;
    }

    @keyframes shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    .chart-wrapper {
      min-height: 300px;
    }

    .chart-empty {
      height: 250px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
    }

    .empty-icon {
      width: 3rem;
      height: 3rem;
      margin-bottom: 1rem;
    }

    .chart-empty p {
      font-size: 0.875rem;
    }
  `]
})
export class TrendChartComponent implements OnInit, OnChanges {
    private adminService = inject(AdminService);
    private cdr = inject(ChangeDetectorRef);

    @Input() config: TrendChartConfig = {
        title: 'Tendencias de Ingresos',
        showSelector: true,
        height: 300,
        showLegend: true
    };

    @Input() externalData: TrendDataPoint[] | null = null;
    @Output() periodChange = new EventEmitter<TrendPeriod>();

    selectedPeriod: TrendPeriod = 'day';
    loading = false;
    trendData: TrendDataPoint[] = [];
    chartOptions: any = null;

    periods = [
        { value: 'day' as TrendPeriod, label: '7 días', count: 7 },
        { value: 'week' as TrendPeriod, label: '4 semanas', count: 4 },
        { value: 'month' as TrendPeriod, label: '6 meses', count: 6 }
    ];

    ngOnInit(): void {
        if (!this.externalData) {
            this.loadTrendData();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['externalData'] && this.externalData) {
            this.trendData = this.externalData;
            this.buildChart();
        }
    }

    changePeriod(period: TrendPeriod): void {
        this.selectedPeriod = period;
        this.periodChange.emit(period);
        if (!this.externalData) {
            this.loadTrendData();
        }
    }

    loadTrendData(): void {
        this.loading = true;
        const periodConfig = this.periods.find(p => p.value === this.selectedPeriod)!;

        this.adminService.getRevenueTrend(this.selectedPeriod, periodConfig.count).subscribe({
            next: (response) => {
                if (response.success) {
                    this.trendData = response.data;
                    this.buildChart();
                }
                this.loading = false;
                this.cdr.markForCheck();
            },
            error: (err) => {
                console.error('Error loading trend data:', err);
                this.loading = false;
                this.cdr.markForCheck();
            }
        });
    }

    private buildChart(): void {
        if (!this.trendData || this.trendData.length === 0) {
            this.chartOptions = null;
            return;
        }

        const categories = this.trendData.map(d => this.formatDate(d.period));

        this.chartOptions = {
            series: [
                {
                    name: 'Comisiones',
                    data: this.trendData.map(d => d.commission)
                },
                {
                    name: 'GMV',
                    data: this.trendData.map(d => d.gmv)
                }
            ],
            chart: {
                type: 'area',
                height: this.config.height || 300,
                toolbar: { show: false },
                fontFamily: 'inherit',
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 500
                }
            },
            colors: ['#10B981', '#6366F1'],
            stroke: {
                curve: 'smooth',
                width: 2
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.4,
                    opacityTo: 0.05,
                    stops: [0, 100]
                }
            },
            xaxis: {
                categories,
                labels: {
                    style: {
                        colors: '#9ca3af',
                        fontSize: '11px'
                    }
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: {
                    style: {
                        colors: '#9ca3af',
                        fontSize: '11px'
                    },
                    formatter: (val: number) => this.formatCurrency(val)
                }
            },
            tooltip: {
                theme: 'light',
                y: {
                    formatter: (val: number) => this.formatCurrency(val)
                }
            },
            legend: {
                show: this.config.showLegend,
                position: 'top',
                horizontalAlign: 'right',
                fontWeight: 600,
                markers: {
                    width: 8,
                    height: 8,
                    radius: 4
                }
            },
            grid: {
                borderColor: '#f3f4f6',
                strokeDashArray: 4
            },
            dataLabels: {
                enabled: false
            }
        };
    }

    private formatDate(dateString: string): string {
        const date = new Date(dateString);
        if (this.selectedPeriod === 'day') {
            return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
        } else if (this.selectedPeriod === 'week') {
            return `Sem ${this.getWeekNumber(date)}`;
        } else {
            return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
        }
    }

    private getWeekNumber(date: Date): number {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
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

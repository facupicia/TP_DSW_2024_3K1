import { Component, OnInit, inject, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { catchError, of, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { StatsService, ComparativeData } from '../../services/stats.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';
import { HeaderComponent } from '../../components/header/header.component';
import { UpgradeButtonComponent } from '../../components/upgrade-button/upgrade-button.component';
import { ToastService } from '../../services/toast.service';

/* ============================================================================
   INTERFACES
============================================================================ */

interface KPIMetrics {
    totalRevenue: number;
    totalTicketsSold: number;
    avgTicketPrice: number;
    revenueGrowth: number;
    ticketsGrowth: number;
    totalEvents: number;
}

// Using 'any' for chart options to avoid Angular template index signature issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartOptions = any;

/* ============================================================================
   CHART CONFIGURATIONS
============================================================================ */

const BASE_CHART_CONFIG = {
    fontFamily: 'Inter, sans-serif',
    toolbar: { show: false }
};

const createRevenueChartOptions = (): ChartOptions => ({
    series: [],
    chart: { type: 'area', height: 350, ...BASE_CHART_CONFIG },
    stroke: { curve: 'smooth', width: 3 },
    fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.1, stops: [0, 90, 100] }
    },
    dataLabels: { enabled: false },
    xaxis: {
        categories: [],
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#9ca3af' } }
    },
    yaxis: {
        labels: {
            style: { colors: '#9ca3af' },
            formatter: (val: number) => `$${(val / 1000).toFixed(1)}k`
        }
    },
    grid: { borderColor: '#f3f4f6', strokeDashArray: 4 },
    colors: ['#3b82f6'],
    tooltip: { theme: 'light', y: { formatter: (val: number) => `$${val.toLocaleString()}` } }
});

const createRetentionChartOptions = (): ChartOptions => ({
    series: [0],
    chart: { type: 'radialBar', height: 300, ...BASE_CHART_CONFIG },
    plotOptions: {
        radialBar: {
            hollow: { size: '65%' },
            track: { background: '#f3f4f6' },
            dataLabels: {
                show: true,
                name: { show: true, fontSize: '14px', color: '#6b7280', offsetY: -10 },
                value: { show: true, fontSize: '36px', fontWeight: 700, color: '#111827', offsetY: 10 }
            }
        }
    },
    colors: ['#0ea5e9'],
    labels: ['Ocupación Promedio'],
    stroke: { lineCap: 'round' }
});

const createTopEventsChartOptions = (): ChartOptions => ({
    series: [],
    chart: { type: 'bar', height: 300, ...BASE_CHART_CONFIG },
    plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '50%' } },
    dataLabels: {
        enabled: true,
        textAnchor: 'start',
        style: { colors: ['#fff'] },
        formatter: (val: number) => val.toString()
    },
    xaxis: { categories: [], labels: { show: false }, axisBorder: { show: false } },
    grid: { show: false },
    colors: ['#8b5cf6']
});

/* ============================================================================
   COMPONENT
============================================================================ */

@Component({
    selector: 'app-creator-stats',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        NgApexchartsModule,
        HeaderComponent,
        RouterModule,
        UpgradeButtonComponent
    ],
    templateUrl: './creator-stats.component.html',
    styleUrls: ['./creator-stats.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreatorStatsComponent implements OnInit {
    // Dependency Injection
    private readonly statsService = inject(StatsService);
    private readonly subscriptionService = inject(SubscriptionService);
    private readonly router = inject(Router);
    private readonly toastService = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);

    // Subscription State
    isPro = false;
    subscription: UserSubscription | null = null;

    // Filter State
    period: 'mensual' | 'anual' | '' = 'mensual';

    // Data
    comparative: ComparativeData[] = [];
    metrics: KPIMetrics = {
        totalRevenue: 0,
        totalTicketsSold: 0,
        avgTicketPrice: 0,
        revenueGrowth: 0,
        ticketsGrowth: 0,
        totalEvents: 0
    };
    recentActivity: any[] = [];

    // Loading States
    isLoading = false;

    // Chart Options
    revenueChartOptions = createRevenueChartOptions();
    retentionChartOptions = createRetentionChartOptions();
    topEventsChartOptions = createTopEventsChartOptions();

    // Computed getters for template
    get totalRevenue(): number { return this.metrics.totalRevenue; }
    get totalTicketsSold(): number { return this.metrics.totalTicketsSold; }
    get avgTicketPrice(): number { return this.metrics.avgTicketPrice; }

    /* ========== LIFECYCLE ========== */

    ngOnInit(): void {
        this.loadSubscription();
        this.loadAllData();
    }

    /* ========== DATA LOADING ========== */

    private loadSubscription(): void {
        this.subscriptionService.getMySubscription().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (sub) => {
                this.subscription = sub;
                this.isPro = sub.plan?.name === 'PRO' && sub.status === 'active';
            },
            error: () => {
                this.isPro = false;
            }
        });
    }


    loadAllData(): void {
        this.isLoading = true;
        
        // Load both comparative and metrics data in parallel
        forkJoin({
            comparative: this.statsService.getComparative(this.period).pipe(
                catchError(() => of({ comparative: [] }))
            ),
            metrics: this.statsService.getMetrics(this.period).pipe(
                catchError(() => of({ 
                    totalRevenue: 0, 
                    totalTickets: 0, 
                    avgPrice: 0, 
                    totalEvents: 0,
                    revenueGrowth: 0, 
                    ticketsGrowth: 0,
                    topEvents: [],
                    recentActivity: []
                }))
            )
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (data) => {
                this.comparative = data.comparative?.comparative ?? [];
                
                // Use real growth data from backend
                this.metrics = {
                    totalRevenue: data.metrics.totalRevenue,
                    totalTicketsSold: data.metrics.totalTickets,
                    avgTicketPrice: data.metrics.avgPrice,
                    revenueGrowth: data.metrics.revenueGrowth,
                    ticketsGrowth: data.metrics.ticketsGrowth,
                    totalEvents: data.metrics.totalEvents
                };
                
                this.recentActivity = data.metrics.recentActivity || [];
                this.updateAllCharts();
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
            }
        });
    }

    /* ========== CALCULATIONS ========== */
    // Growth metrics now come from backend in getMetrics() call

    /* ========== CHART UPDATES ========== */

    private updateAllCharts(): void {
        this.updateRevenueChart();
        this.updateRetentionChart();
        this.updateTopEventsChart();
    }

    private updateRevenueChart(): void {
        const categories = this.comparative.map(c =>
            c.title.length > 12 ? c.title.substring(0, 12) + '...' : c.title
        );
        const revenueData = this.comparative.map(c => c.revenue || 0);

        this.revenueChartOptions = {
            ...this.revenueChartOptions,
            series: [{ name: 'Ingresos', data: revenueData }],
            xaxis: { ...this.revenueChartOptions['xaxis'], categories }
        };
    }

    private updateRetentionChart(): void {
        const avgAttendance = this.comparative.length > 0
            ? this.comparative.reduce((acc, curr) => acc + (curr.attendanceRate || 0), 0) / this.comparative.length
            : 0;

        this.retentionChartOptions = {
            ...this.retentionChartOptions,
            series: [parseFloat((avgAttendance * 100).toFixed(1))]
        };
    }

    private updateTopEventsChart(): void {
        const sorted = [...this.comparative]
            .sort((a, b) => (b.participants || 0) - (a.participants || 0))
            .slice(0, 5);

        this.topEventsChartOptions = {
            ...this.topEventsChartOptions,
            series: [{ name: 'Tickets', data: sorted.map(s => s.participants || 0) }],
            xaxis: { ...this.topEventsChartOptions['xaxis'], categories: sorted.map(s => s.title) }
        };
    }

    /* ========== USER ACTIONS ========== */

    onPeriodChange(): void {
        this.loadAllData();
    }

    goToUpgrade(): void {
        this.router.navigate(['/profile']);
    }

    /* ========== EXPORTS (PRO ONLY) ========== */

    exportPdf(): void {
        if (!this.isPro) {
            this.toastService.warning('Función disponible solo para usuarios PRO');
            return;
        }

        // Generate PDF report
        const reportData = {
            period: this.period || 'Histórico',
            metrics: this.metrics,
            events: this.comparative
        };

        this.toastService.info('Generando PDF...');

        // Create a simple PDF-ready HTML and trigger print
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Reporte de Estadísticas</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 40px; }
                        h1 { color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
                        .metrics { display: flex; gap: 20px; margin: 20px 0; }
                        .metric { background: #f3f4f6; padding: 20px; border-radius: 8px; }
                        .metric-label { font-size: 12px; color: #6b7280; }
                        .metric-value { font-size: 24px; font-weight: bold; color: #1f2937; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
                        th { background: #f9fafb; font-weight: 600; }
                    </style>
                </head>
                <body>
                    <h1>📊 Reporte de Estadísticas - ${reportData.period}</h1>
                    <div class="metrics">
                        <div class="metric">
                            <div class="metric-label">Ingresos Totales</div>
                            <div class="metric-value">$${reportData.metrics.totalRevenue.toLocaleString()}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Tickets Vendidos</div>
                            <div class="metric-value">${reportData.metrics.totalTicketsSold}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Ticket Promedio</div>
                            <div class="metric-value">$${reportData.metrics.avgTicketPrice.toFixed(0)}</div>
                        </div>
                    </div>
                    <h2>Detalle por Evento</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Evento</th>
                                <th>Tickets</th>
                                <th>Ingresos</th>
                                <th>Ocupación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reportData.events.map(e => `
                                <tr>
                                    <td>${e.title}</td>
                                    <td>${e.participants}</td>
                                    <td>$${e.revenue.toLocaleString()}</td>
                                    <td>${(e.attendanceRate * 100).toFixed(0)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <p style="margin-top: 40px; color: #9ca3af; font-size: 12px;">
                        Generado el ${new Date().toLocaleString()}
                    </p>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        }
    }

    exportCsv(): void {
        if (!this.isPro) {
            this.toastService.warning('Función disponible solo para usuarios PRO');
            return;
        }

        // Generate CSV
        const headers = ['Evento', 'Tickets Vendidos', 'Ingresos', 'Ocupación'];
        const rows = this.comparative.map(e => [
            `"${e.title}"`,
            e.participants,
            e.revenue,
            `${(e.attendanceRate * 100).toFixed(1)}%`
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `estadisticas_${this.period || 'historico'}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();

        this.toastService.success('CSV descargado');
    }
}
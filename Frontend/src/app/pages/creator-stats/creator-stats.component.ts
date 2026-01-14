import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { StatsService } from '../../services/stats.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';
import { NgApexchartsModule, ChartComponent } from 'ng-apexcharts';
import { HeaderComponent } from '../../components/header/header.component';
import { interval, Subscription, switchMap, of, catchError } from 'rxjs';

@Component({
    selector: 'app-creator-stats',
    standalone: true,
    imports: [CommonModule, FormsModule, NgApexchartsModule, HeaderComponent, RouterModule],
    templateUrl: './creator-stats.component.html',
    styleUrls: ['./creator-stats.component.css']
})
export class CreatorStatsComponent implements OnInit, OnDestroy {
    @ViewChild('chart') chart!: ChartComponent;

    // Subscription state
    isPro = false;
    subscription: UserSubscription | null = null;

    period = 'mensual';
    metrics: any = {};
    comparative: any[] = [];
    refresh$: Subscription | null = null;

    // KPIs calculados
    totalRevenue = 0;
    totalTicketsSold = 0;
    avgTicketPrice = 0;

    // Configuración de Gráficos (Estilo Reference Image)

    // 1. Gráfico Principal (Revenue Trend) - Estilo Azul Suave
    revenueChartOptions: any = {
        series: [],
        chart: { type: 'area', height: 350, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
        stroke: { curve: 'smooth', width: 3 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.1, stops: [0, 90, 100] } },
        dataLabels: { enabled: false },
        xaxis: { categories: [], axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#9ca3af' } } },
        yaxis: { labels: { style: { colors: '#9ca3af' }, formatter: (val: number) => `$${val / 1000}k` } },
        grid: { borderColor: '#f3f4f6', strokeDashArray: 4 },
        colors: ['#3b82f6'], // Azul principal
        tooltip: { theme: 'light', y: { formatter: (val: number) => `$${val}` } }
    };

    // 2. Gráfico Radial (Objetivo/Retención) - El círculo del 52%
    retentionChartOptions: any = {
        series: [0],
        chart: { type: 'radialBar', height: 300, fontFamily: 'Inter, sans-serif' },
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
        colors: ['#0ea5e9'], // Cyan/Azul
        labels: ['Ocupación Promedio'], // O "Retención"
        stroke: { lineCap: 'round' }
    };

    // 3. Gráfico Top Eventos (Barras Horizontales)
    topEventsChartOptions: any = {
        series: [],
        chart: { type: 'bar', height: 300, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
        plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '50%' } },
        dataLabels: { enabled: true, textAnchor: 'start', style: { colors: ['#fff'] }, formatter: (val: number) => val },
        xaxis: { categories: [], labels: { show: false }, axisBorder: { show: false } },
        grid: { show: false },
        colors: ['#8b5cf6'], // Violeta
    };

    constructor(
        private stats: StatsService,
        private subscriptionService: SubscriptionService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.loadSubscription();
        this.loadAll();
    }

    private loadSubscription(): void {
        this.subscriptionService.getMySubscription().subscribe({
            next: (sub) => {
                this.subscription = sub;
                this.isPro = sub.plan?.name === 'PRO' && sub.status === 'active';
            },
            error: () => {
                this.isPro = false;
            }
        });
    }

    goToUpgrade(): void {
        this.router.navigate(['/profile']);
    }

    ngOnDestroy(): void {
        this.refresh$?.unsubscribe();
    }

    onPeriodChange() { this.loadAll(); }

    loadAll() {
        // Simulamos carga combinada para el ejemplo
        this.stats.getComparative(this.period).pipe(
            catchError(() => of({ comparative: [] }))
        ).subscribe(data => {
            this.comparative = data?.comparative ?? [];
            this.calculateKPIs();
            this.updateCharts();
        });
    }

    calculateKPIs() {
        this.totalRevenue = this.comparative.reduce((acc, curr) => acc + curr.revenue, 0);
        this.totalTicketsSold = this.comparative.reduce((acc, curr) => acc + curr.participants, 0);
        this.avgTicketPrice = this.totalTicketsSold > 0 ? this.totalRevenue / this.totalTicketsSold : 0;
    }

    updateCharts() {
        // 1. Chart Revenue (Area)
        const categories = this.comparative.map(c => c.title.substring(0, 10) + '...'); // Nombres cortos
        const revenueData = this.comparative.map(c => c.revenue);

        this.revenueChartOptions = {
            ...this.revenueChartOptions,
            series: [{ name: 'Ingresos', data: revenueData }],
            xaxis: { ...this.revenueChartOptions.xaxis, categories }
        };

        // 2. Chart Radial (Usamos el promedio de ocupación como KPI visual clave)
        const avgAttendance = this.comparative.reduce((acc, curr) => acc + curr.attendanceRate, 0) / (this.comparative.length || 1);
        this.retentionChartOptions = {
            ...this.retentionChartOptions,
            series: [(avgAttendance * 100).toFixed(1)]
        };

        // 3. Chart Top Eventos (Ordenamos por tickets vendidos)
        const sorted = [...this.comparative].sort((a, b) => b.participants - a.participants).slice(0, 5);
        this.topEventsChartOptions = {
            ...this.topEventsChartOptions,
            series: [{ name: 'Tickets', data: sorted.map(s => s.participants) }],
            xaxis: { categories: sorted.map(s => s.title) }
        };
    }

    // ... Tus funciones de exportar PDF/CSV se mantienen igual
    exportPdf() { /* ... */ }
    exportCsv() { /* ... */ }
}
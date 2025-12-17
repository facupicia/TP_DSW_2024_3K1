import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StatsService } from '../../services/stats.service';
import { NgApexchartsModule } from 'ng-apexcharts';
import { HeaderComponent } from '../../components/header/header.component';
import { interval, Subscription, switchMap, of, catchError } from 'rxjs';

@Component({
    selector: 'app-creator-stats',
    standalone: true,
    imports: [CommonModule, FormsModule, NgApexchartsModule, HeaderComponent],
    templateUrl: './creator-stats.component.html',
    styleUrls: ['./creator-stats.component.css']
})
export class CreatorStatsComponent implements OnInit, OnDestroy {
    period = 'mensual';
    metrics: any = { totalEventsCreated: 0, averageParticipantsPerEvent: 0, attendanceRate: 0, categoryDistribution: [] };
    comparative: any[] = [];
    refresh$: Subscription | null = null;

    // 1. Agrega estas variables a tu clase
    totalRevenue: number = 0;
    totalTicketsSold: number = 0;
    averageTicketPrice: number = 0;

    // --- CONFIGURACIÓN ESTÉTICA DE GRÁFICOS ---

    // 1. Gráfico de Barras (Categorías)
    categoryChartOptions: any = {
        series: [],
        chart: { type: 'bar', height: 350, toolbar: { show: false }, fontFamily: 'inherit' },
        plotOptions: { bar: { borderRadius: 8, columnWidth: '40%', distributed: true } }, // Barras redondeadas y separadas
        dataLabels: { enabled: false },
        xaxis: { categories: [], labels: { style: { fontSize: '12px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { show: false }, // Ocultar eje Y para limpieza
        grid: { show: false }, // Sin cuadrícula de fondo
        colors: ['#3b82f6', '#8b5cf6', '#06b6d4', '#f97316'], // Paleta personalizada
        tooltip: { theme: 'light' }
    };

    // 2. Gráfico de Líneas (Comparativa)
    comparativeChartOptions: any = {
        series: [],
        chart: { type: 'area', height: 350, toolbar: { show: false }, fontFamily: 'inherit' }, // 'area' se ve mejor que 'line'
        stroke: { curve: 'smooth', width: 3 }, // Líneas curvas suaves
        dataLabels: { enabled: false },
        xaxis: { categories: [], axisBorder: { show: false }, axisTicks: { show: false } },
        grid: { borderColor: '#f3f4f6', strokeDashArray: 4 }, // Cuadrícula punteada sutil
        colors: ['#10b981', '#6366f1'], // Verde (Dinero) y Indigo (Gente)
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
        tooltip: { theme: 'light' }
    };

    constructor(private stats: StatsService) { }

    ngOnInit(): void {
        this.loadAll();
        // Polling cada 10s para no saturar
        this.refresh$ = interval(10000).pipe(
            switchMap(() => this.stats.getMetrics(this.period))
        ).subscribe(m => {
            this.metrics = m;
            this.updateCharts();
        });
    }

    ngOnDestroy(): void {
        this.refresh$?.unsubscribe();
    }

    onPeriodChange() {
        this.loadAll();
    }

    loadAll() {
        this.stats.getMetrics(this.period).pipe(
            catchError(() => of({ totalEventsCreated: 0, averageParticipantsPerEvent: 0, attendanceRate: 0, categoryDistribution: [] }))
        ).subscribe(m => {
            this.metrics = m;
            this.updateCharts();
        });

        this.stats.getComparative(this.period).pipe(
            catchError(() => of({ comparative: [] }))
        ).subscribe(c => {
            this.comparative = c?.comparative ?? [];

            // --- CÁLCULOS EN EL FRONTEND ---
            // Sumamos todos los ingresos de todos los eventos del periodo
            this.totalRevenue = this.comparative.reduce((acc, curr) => acc + curr.revenue, 0);

            // Sumamos todos los participantes (tickets vendidos)
            this.totalTicketsSold = this.comparative.reduce((acc, curr) => acc + curr.participants, 0);

            // Calculamos el precio promedio del ticket (Ticket Medio)
            this.averageTicketPrice = this.totalTicketsSold > 0
                ? this.totalRevenue / this.totalTicketsSold
                : 0;

            this.updateComparativeChart();
        });
    }

    updateCharts() {
        const categories = this.metrics.categoryDistribution.map((d: any) => d.name);
        const values = this.metrics.categoryDistribution.map((d: any) => d.count);

        this.categoryChartOptions = {
            ...this.categoryChartOptions,
            series: [{ name: 'Eventos', data: values }],
            xaxis: { ...this.categoryChartOptions.xaxis, categories }
        };
    }

    updateComparativeChart() {
        const categories = this.comparative.map(c => c.title);
        const participants = this.comparative.map(c => c.participants);
        const revenue = this.comparative.map(c => c.revenue);

        this.comparativeChartOptions = {
            ...this.comparativeChartOptions,
            series: [
                { name: 'Participantes', data: participants },
                { name: 'Ingresos ($)', data: revenue }
            ],
            xaxis: { ...this.comparativeChartOptions.xaxis, categories }
        };
    }

    exportPdf() {
        this.stats.exportPdf(this.period).subscribe(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reporte-${this.period}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
        });
    }
}
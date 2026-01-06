import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StatsService } from '../../services/stats.service';
import { NgApexchartsModule, ChartComponent } from 'ng-apexcharts';
import { catchError, of, Subscription, interval } from 'rxjs';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'app-event-stats',
  standalone: true,
  imports: [CommonModule, FormsModule, NgApexchartsModule, RouterModule, HeaderComponent],
  templateUrl: './event-stats.component.html',
  styleUrls: ['./event-stats.component.css']
})
export class EventStatsComponent implements OnInit, OnDestroy {
  @ViewChild('chart') chart!: ChartComponent;

  eventId!: number;
  eventTitle = '';
  isLoading = true;
  
  // Datos Principales
  data: { participants: number, revenue: number, attendanceRate: number } = {
    participants: 0,
    revenue: 0,
    attendanceRate: 0
  };
  
  // KPI Calculado (Simulado)
  checkInCount = 0; 
  checkInPercentage = 0;

  demographics: { ages: any, locations: any[] } = { ages: {}, locations: [] };

  // --- CONFIGURACIÓN DE GRÁFICOS ---

  // 1. Curva de Ventas (Ritmo)
  salesCurveOptions: any = {
    series: [],
    chart: { type: 'area', height: 300, toolbar: { show: false }, fontFamily: 'inherit' },
    stroke: { curve: 'smooth', width: 3 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.0, stops: [0, 90, 100] } },
    dataLabels: { enabled: false },
    xaxis: { categories: [], axisBorder: { show: false }, axisTicks: { show: false } },
    grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
    colors: ['#10b981'], // Verde Esmeralda
    tooltip: { theme: 'light' },
    title: { text: 'Ritmo de Ventas (Últimos 7 días)', style: { fontSize: '14px', color: '#64748b', fontWeight: 600 } }
  };

  // 2. Tipos de Ticket (Distribución)
  ticketTypeOptions: any = {
    series: [],
    chart: { type: 'donut', height: 320, fontFamily: 'inherit' },
    labels: ['General', 'VIP', 'Early Bird'],
    colors: ['#3b82f6', '#8b5cf6', '#f59e0b'],
    plotOptions: { pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Total', fontSize: '14px', fontWeight: 600 } } } } },
    dataLabels: { enabled: false },
    legend: { position: 'bottom' },
    title: { text: 'Distribución por Ticket', style: { fontSize: '14px', color: '#64748b', fontWeight: 600 } }
  };

  // 3. Demografía (Edad)
  ageChartOptions: any = {
    series: [],
    chart: { type: 'bar', height: 250, toolbar: { show: false }, fontFamily: 'inherit' },
    plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
    dataLabels: { enabled: false },
    xaxis: { categories: [], axisBorder: { show: false }, axisTicks: { show: false } },
    grid: { show: false },
    colors: ['#6366f1'],
    title: { text: 'Rango de Edad', style: { fontSize: '14px', color: '#64748b', fontWeight: 600 } }
  };

  // 4. Ubicación (Top Cities)
  locationChartOptions: any = {
    series: [],
    chart: { type: 'bar', height: 250, toolbar: { show: false }, fontFamily: 'inherit' },
    plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '50%' } },
    dataLabels: { enabled: true, textAnchor: 'start', style: { colors: ['#fff'] }, formatter: (val: number) => val },
    xaxis: { categories: [], labels: { show: false }, axisBorder: { show: false } },
    grid: { show: false },
    colors: ['#0ea5e9'],
    title: { text: 'Top Ubicaciones', style: { fontSize: '14px', color: '#64748b', fontWeight: 600 } }
  };

  refresh$: Subscription | null = null;

  constructor(private route: ActivatedRoute, private router: Router, private stats: StatsService) { }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam || isNaN(Number(idParam)) || Number(idParam) <= 0) {
      this.router.navigate(['/']);
      return;
    }
    this.eventId = Number(idParam);

    this.load();
    // Refrescar cada 15s para ver check-ins en "casi" tiempo real
    this.refresh$ = interval(15000).subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.refresh$?.unsubscribe();
  }

  load() {
    this.stats.getEventStats(this.eventId).pipe(
      catchError(() => {
        this.isLoading = false;
        return of(null);
      })
    ).subscribe(data => {
      if (data) this.processData(data);
      this.isLoading = false;
    });
  }

  processData(data: any) {
    this.eventTitle = data.title;
    this.data = {
      participants: data.totalParticipants,
      revenue: data.revenue,
      attendanceRate: data.attendanceRate
    };
    this.demographics = data.demographics;
    
    // --- SIMULACIÓN DE DATOS (Hasta que el backend los traiga reales) ---
    
    // 1. Check-in: Asumimos que el 65% ya ingresó (dato operativo crítico)
    this.checkInCount = Math.floor(this.data.participants * 0.65);
    this.checkInPercentage = 65;

    this.updateCharts();
  }

  updateCharts() {
    // 1. SALES CURVE (Simulada: Distribuimos las ventas en 7 días)
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    // Creamos una curva "creíble" basada en el total
    const base = this.data.participants / 15; 
    const trend = [1, 1.5, 2, 0.8, 3, 5, 2].map(factor => Math.floor(base * factor));
    
    this.salesCurveOptions = {
        ...this.salesCurveOptions,
        series: [{ name: 'Ventas', data: trend }],
        xaxis: { ...this.salesCurveOptions.xaxis, categories: days }
    };

    // 2. TICKET TYPES (Simulado)
    const vip = Math.floor(this.data.participants * 0.15); // 15% VIP
    const early = Math.floor(this.data.participants * 0.25); // 25% Anticipadas
    const general = this.data.participants - vip - early;
    
    this.ticketTypeOptions = {
        ...this.ticketTypeOptions,
        series: [general, vip, early]
    };

    // 3. EDAD
    const ageLabels = Object.keys(this.demographics.ages || {});
    const ageValues = Object.values(this.demographics.ages || {}) as number[];
    this.ageChartOptions = {
        ...this.ageChartOptions,
        series: [{ name: 'Participantes', data: ageValues }],
        xaxis: { ...this.ageChartOptions.xaxis, categories: ageLabels }
    };

    // 4. UBICACIÓN
    const sortedLocs = [...(this.demographics.locations || [])]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5); // Solo Top 5
        
    this.locationChartOptions = {
        ...this.locationChartOptions,
        series: [{ name: 'Participantes', data: sortedLocs.map(d => d.value) }],
        xaxis: { ...this.locationChartOptions.xaxis, categories: sortedLocs.map(d => d.name) }
    };
  }
}
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StatsService } from '../../services/stats.service';
import { SubscriptionService, UserSubscription } from '../../services/subscription.service';
import { NgApexchartsModule, ChartComponent } from 'ng-apexcharts';
import { catchError, of, Subscription, interval, take } from 'rxjs';
import { HeaderComponent } from '../../components/header/header.component';
import { UpgradeButtonComponent } from '../../components/upgrade-button/upgrade-button.component';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-event-stats',
    imports: [CommonModule, FormsModule, NgApexchartsModule, RouterModule, HeaderComponent, UpgradeButtonComponent],
    templateUrl: './event-stats.component.html',
    styleUrls: ['./event-stats.component.css']
})
export class EventStatsComponent implements OnInit, OnDestroy {
  @ViewChild('chart') chart!: ChartComponent;

  // Subscription state
  isPro = false;
  subscription: UserSubscription | null = null;

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

  demographics: { ages: any, ciudades: any[] } = { ages: {}, ciudades: [] };

  // Datos reales del backend
  ticketTypeData: any[] = [];
  salesByDayData: any[] = [];

  // Extras data
  extrasData: { extrasSold: number, extrasRevenue: number, extrasUsedCount: number, extrasAttendanceRate: number } = {
    extrasSold: 0, extrasRevenue: 0, extrasUsedCount: 0, extrasAttendanceRate: 0
  };
  extraTypeData: any[] = [];
  extrasSalesByDayData: any[] = [];
  extraStockVsSoldData: any[] = [];

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

  // 5. Extras by Category (Donut)
  extraTypeOptions: any = {
    series: [],
    chart: { type: 'donut', height: 320, fontFamily: 'inherit' },
    labels: [],
    colors: ['#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981'],
    plotOptions: { pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Total', fontSize: '14px', fontWeight: 600 } } } } },
    dataLabels: { enabled: false },
    legend: { position: 'bottom' },
    title: { text: 'Extras por Categoría', style: { fontSize: '14px', color: '#64748b', fontWeight: 600 } }
  };

  // 6. Stock vs Sold (Bar horizontal)
  extraStockOptions: any = {
    series: [],
    chart: { type: 'bar', height: 250, toolbar: { show: false }, fontFamily: 'inherit' },
    plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '50%' } },
    dataLabels: { enabled: true, textAnchor: 'start', style: { colors: ['#fff'] }, formatter: (val: number) => val },
    xaxis: { categories: [], labels: { show: false }, axisBorder: { show: false } },
    grid: { show: false },
    colors: ['#f97316'],
    title: { text: 'Stock vs Vendido', style: { fontSize: '14px', color: '#64748b', fontWeight: 600 } }
  };

  refresh$: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private stats: StatsService,
    private subscriptionService: SubscriptionService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam || isNaN(Number(idParam)) || Number(idParam) <= 0) {
      this.router.navigate(['/']);
      return;
    }
    this.eventId = Number(idParam);

    this.authService.ensureCurrentUser().pipe(take(1)).subscribe(user => {
      if (!user) {
        this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
        return;
      }

      this.loadSubscription();
      this.load();
      // Refrescar cada 15s para ver check-ins en "casi" tiempo real
      this.refresh$?.unsubscribe();
      this.refresh$ = interval(15000).subscribe(() => this.load());
    });
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

  load() {
    if (typeof window === 'undefined') return;
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

    // Usar datos REALES del backend
    this.checkInCount = data.checkInCount || 0;
    this.checkInPercentage = data.totalParticipants > 0
      ? Math.round((data.checkInCount / data.totalParticipants) * 100)
      : 0;

    // Guardar distribución real de tickets
    this.ticketTypeData = data.ticketTypeDistribution || [];
    this.salesByDayData = data.salesByDay || [];

    // Extras data
    this.extrasData = {
      extrasSold: data.extrasSold || 0,
      extrasRevenue: data.extrasRevenue || 0,
      extrasUsedCount: data.extrasUsedCount || 0,
      extrasAttendanceRate: data.extrasAttendanceRate || 0
    };
    this.extraTypeData = data.extraTypeDistribution || [];
    this.extrasSalesByDayData = data.extrasSalesByDay || [];
    this.extraStockVsSoldData = data.extraStockVsSold || [];

    this.updateCharts();
  }

  updateCharts() {
    // 1. SALES CURVE - Series dobles: tickets + extras
    const reversed = [...this.salesByDayData].reverse();
    const extrasReversed = [...this.extrasSalesByDayData].reverse();
    const allDates = new Set<string>();
    reversed.forEach((s: any) => allDates.add(s.date?.substring(5, 10) || 'N/A'));
    extrasReversed.forEach((s: any) => allDates.add(s.date?.substring(5, 10) || 'N/A'));
    const categories = Array.from(allDates).sort();

    const ticketMap = new Map(reversed.map((s: any) => [s.date?.substring(5, 10) || 'N/A', s.count]));
    const extrasMap = new Map(extrasReversed.map((s: any) => [s.date?.substring(5, 10) || 'N/A', s.count]));

    this.salesCurveOptions = {
      ...this.salesCurveOptions,
      series: [
        { name: 'Tickets', data: categories.map(d => ticketMap.get(d) || 0) },
        { name: 'Extras', data: categories.map(d => extrasMap.get(d) || 0) }
      ],
      colors: ['#10b981', '#f59e0b'],
      xaxis: { ...this.salesCurveOptions.xaxis, categories }
    };

    // 2. TICKET TYPES - Usar datos REALES
    if (this.ticketTypeData && this.ticketTypeData.length > 0) {
      this.ticketTypeOptions = {
        ...this.ticketTypeOptions,
        labels: this.ticketTypeData.map((t: any) => t.name),
        series: this.ticketTypeData.map((t: any) => t.count)
      };
    } else {
      this.ticketTypeOptions = {
        ...this.ticketTypeOptions,
        labels: ['Sin datos'],
        series: [0]
      };
    }

    // 3. EDAD
    const ageLabels = Object.keys(this.demographics.ages || {});
    const ageValues = Object.values(this.demographics.ages || {}) as number[];
    this.ageChartOptions = {
      ...this.ageChartOptions,
      series: [{ name: 'Participantes', data: ageValues }],
      xaxis: { ...this.ageChartOptions.xaxis, categories: ageLabels }
    };

    // 4. CIUDADES
    const sortedCities = [...(this.demographics.ciudades || [])]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Solo Top 5

    this.locationChartOptions = {
      ...this.locationChartOptions,
      series: [{ name: 'Participantes', data: sortedCities.map(d => d.value) }],
      xaxis: { ...this.locationChartOptions.xaxis, categories: sortedCities.map(d => d.name) }
    };

    // 5. EXTRAS BY CATEGORY
    if (this.extraTypeData && this.extraTypeData.length > 0) {
      this.extraTypeOptions = {
        ...this.extraTypeOptions,
        labels: this.extraTypeData.map((t: any) => t.category),
        series: this.extraTypeData.map((t: any) => t.count)
      };
    } else {
      this.extraTypeOptions = {
        ...this.extraTypeOptions,
        labels: ['Sin datos'],
        series: [0]
      };
    }

    // 6. STOCK VS SOLD
    if (this.extraStockVsSoldData && this.extraStockVsSoldData.length > 0) {
      const sorted = [...this.extraStockVsSoldData]
        .sort((a: any, b: any) => (b.soldCount || 0) - (a.soldCount || 0))
        .slice(0, 5);
      this.extraStockOptions = {
        ...this.extraStockOptions,
        series: [{ name: 'Vendidos', data: sorted.map((s: any) => s.soldCount || 0) }],
        xaxis: { ...this.extraStockOptions.xaxis, categories: sorted.map((s: any) => s.name) }
      };
    } else {
      this.extraStockOptions = {
        ...this.extraStockOptions,
        series: [{ name: 'Vendidos', data: [] }],
        xaxis: { ...this.extraStockOptions.xaxis, categories: [] }
      };
    }
  }
}

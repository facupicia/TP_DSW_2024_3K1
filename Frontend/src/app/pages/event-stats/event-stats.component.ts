import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StatsService } from '../../services/stats.service';
import { NgApexchartsModule, ChartComponent, ApexOptions } from 'ng-apexcharts';
import { catchError, of, Subscription, switchMap, interval, tap } from 'rxjs';
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

  period = 'mensual';
  eventId!: number;
  eventTitle = '';
  isLoading = true;
  isDesktop = true;
  private mq!: MediaQueryList;
  private mqListener!: (e: MediaQueryListEvent) => void;

  // Datos iniciales
  data: { participants: number, revenue: number, attendanceRate: number } = {
    participants: 0,
    revenue: 0,
    attendanceRate: 0
  };

  // Configuración de Chart estilo Apple
  public chartOptions: Partial<ApexOptions> | any = {
    series: [],
    chart: {
      type: 'bar',
      height: 350,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      toolbar: { show: false }, // Sin toolbar para limpieza
      animations: { enabled: true }
    },
    colors: ['#007AFF', '#34C759'], // Azul Apple y Verde Dinero
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '40%',
        borderRadius: 6 // Bordes redondeados en las barras
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ['transparent'] },
    xaxis: {
      categories: [],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: '#8E8E93', fontSize: '12px' }
      }
    },
    yaxis: [
      {
        seriesName: 'Participantes',
        title: { text: 'Participantes', style: { color: '#007AFF' } },
        labels: { style: { colors: '#8E8E93' } }
      },
      {
        opposite: true, // Eje derecho para el dinero
        seriesName: 'Ingresos',
        title: { text: 'Ingresos', style: { color: '#34C759' } },
        labels: {
          style: { colors: '#8E8E93' },
          formatter: (value: number) => { return `$${value}` }
        }
      }
    ],
    grid: {
      borderColor: '#F2F2F7',
      strokeDashArray: 4, // Rejilla punteada sutil
      yaxis: { lines: { show: true } }
    },
    tooltip: {
      theme: 'light',
      y: {
        formatter: function (val: number) { return val; }
      }
    },
    legend: { show: true, position: 'top', horizontalAlign: 'left' }
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
    if (typeof window !== 'undefined') {
      this.mq = window.matchMedia('(min-width: 768px)');
      this.isDesktop = this.mq.matches;
      this.mqListener = (e: MediaQueryListEvent) => { this.isDesktop = e.matches; };
      this.mq.addEventListener('change', this.mqListener);
    }

    // Carga inicial
    this.load();

    // Polling cada 10s para actualizaciones en vivo (menos agresivo que 5s)
    this.refresh$ = interval(10000).pipe(
      switchMap(() => this.stats.getComparative(this.period).pipe(catchError(() => of({ comparative: [] }))))
    ).subscribe(c => this.processData(c));
  }

  ngOnDestroy(): void {
    this.refresh$?.unsubscribe();
    if (this.mq && this.mqListener) {
      this.mq.removeEventListener('change', this.mqListener);
    }
  }

  onPeriodChange() {
    this.isLoading = true;
    this.load();
  }

  load() {
    this.stats.getComparative(this.period).pipe(
      catchError(() => {
        this.isLoading = false;
        return of({ comparative: [] });
      })
    ).subscribe(c => this.processData(c));
  }

  processData(response: any) {
    const row = (response.comparative || []).find((r: any) => r.id === this.eventId);

    if (!row && !this.isLoading) {
      // Solo redirigir si ya terminó de cargar y no encuentra nada
      // this.router.navigate(['/my-events']); 
      // Comentado para evitar rebotes si la API falla momentáneamente
      return;
    }

    if (row) {
      this.eventTitle = row.title;
      this.data = {
        participants: row.participants,
        revenue: row.revenue,
        attendanceRate: row.attendanceRate
      };
      this.updateChart();
    }
    this.isLoading = false;
  }

  updateChart() {
    this.chartOptions.series = [
      { name: 'Participantes', data: [this.data.participants] },
      { name: 'Ingresos', data: [this.data.revenue] }
    ];

    this.chartOptions.xaxis = {
      categories: [this.period.charAt(0).toUpperCase() + this.period.slice(1)]
    };

    // Forzar actualización visual si es necesario
    if (this.chart) {
      this.chart.updateSeries(this.chartOptions.series);
    }
  }
}

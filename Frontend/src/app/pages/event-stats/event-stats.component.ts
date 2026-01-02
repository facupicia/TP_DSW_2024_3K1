import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StatsService } from '../../services/stats.service';
import { NgApexchartsModule, ChartComponent, ApexOptions } from 'ng-apexcharts';
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
  isDesktop = true;
  private mq!: MediaQueryList;
  private mqListener!: (e: MediaQueryListEvent) => void;

  // Datos
  data: { participants: number, revenue: number, attendanceRate: number } = {
    participants: 0,
    revenue: 0,
    attendanceRate: 0
  };

  demographics: { ages: any, locations: any[] } = { ages: {}, locations: [] };

  // Chart configurations
  ageChartOptions: Partial<ApexOptions> | any = {
    series: [],
    chart: { type: 'donut', height: 350, fontFamily: 'inherit' },
    labels: [],
    colors: ['#3b82f6', '#8b5cf6', '#06b6d4', '#f97316'],
    dataLabels: { enabled: true },
    legend: { position: 'bottom' },
    title: { text: 'Distribución por Edad', align: 'center' }
  };

  locationChartOptions: Partial<ApexOptions> | any = {
    series: [],
    chart: { type: 'bar', height: 350, fontFamily: 'inherit', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 4, horizontal: true } },
    dataLabels: { enabled: false },
    xaxis: { categories: [] },
    colors: ['#10b981'],
    title: { text: 'Top Ubicaciones', align: 'center' }
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

    this.load();
    this.refresh$ = interval(10000).subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.refresh$?.unsubscribe();
    if (this.mq && this.mqListener) {
      this.mq.removeEventListener('change', this.mqListener);
    }
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
    this.updateCharts();
  }

  updateCharts() {
    // Age Chart
    const ageLabels = Object.keys(this.demographics.ages);
    const ageValues = Object.values(this.demographics.ages) as number[];
    this.ageChartOptions = {
      ...this.ageChartOptions,
      series: ageValues,
      labels: ageLabels
    };

    // Location Chart
    // Sort locations by value desc
    const sortedLocs = [...this.demographics.locations].sort((a, b) => b.value - a.value).slice(0, 10);
    const locNames = sortedLocs.map((d: any) => d.name);
    const locValues = sortedLocs.map((d: any) => d.value);

    this.locationChartOptions = {
      ...this.locationChartOptions,
      series: [{ name: 'Participantes', data: locValues }],
      xaxis: { categories: locNames }
    };
  }
}

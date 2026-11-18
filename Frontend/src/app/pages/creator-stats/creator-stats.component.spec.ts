import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { CreatorStatsComponent } from './creator-stats.component';
import { StatsService } from '../../services/stats.service';
import { SubscriptionService } from '../../services/subscription.service';
import { ToastService } from '../../services/toast.service';

@Component({ imports: [CreatorStatsComponent], template: '<app-creator-stats />' })
class Host {}

describe('Creator stats asynchronous rendering', () => {
  let fixture: ComponentFixture<Host>;
  let sub: Subject<any>;
  let comparative: Subject<any>;
  let metrics: Subject<any>;
  beforeEach(async () => {
    sub = new Subject(); comparative = new Subject(); metrics = new Subject();
    await TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([]),
      { provide: StatsService, useValue: { getComparative: () => comparative, getMetrics: () => metrics } },
      { provide: SubscriptionService, useValue: { getMySubscription: () => sub } },
      { provide: ToastService, useValue: {} }
    ] }).overrideComponent(CreatorStatsComponent, { set: { imports: [], template: '{{isPro}}|{{isLoading}}|{{totalRevenue}}' } }).compileComponents();
    fixture = TestBed.createComponent(Host); fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('renders PRO and delayed revenue without another user interaction', () => {
    sub.next({ plan: { name: 'PRO' }, status: 'active' }); sub.complete();
    comparative.next({ comparative: [] }); comparative.complete();
    metrics.next({ totalRevenue: 1234.56, totalTickets: 2, avgPrice: 617.28, totalEvents: 1 }); metrics.complete();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toBe('true|false|1234.56');
    const component: CreatorStatsComponent = fixture.debugElement.query(By.directive(CreatorStatsComponent)).componentInstance;
    expect(component.revenueChartOptions.tooltip.y.formatter(1234.56)).toContain('ARS');
    expect(component.revenueChartOptions.tooltip.y.formatter(1234.56)).toContain('1.234,56');
  });

  it('cancels outstanding requests on navigation', () => {
    fixture.destroy();
    expect(sub.observed).toBeFalse(); expect(comparative.observed).toBeFalse(); expect(metrics.observed).toBeFalse();
  });
});

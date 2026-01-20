import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService, EventRanking, DateRange } from '../../services/admin.service';
import { CurrencyFormatterPipe } from '../../pipes/formatter.pipes';

@Component({
    selector: 'app-top-events-table',
    standalone: true,
    imports: [CommonModule, CurrencyFormatterPipe],
    template: `
    <div class="top-events-container">
      <div class="table-header">
        <h3 class="table-title">
          <span class="title-icon">🏆</span>
          Top Eventos por Revenue
        </h3>
        <div class="limit-selector">
          <button 
            *ngFor="let l of limits" 
            [class.active]="limit === l"
            (click)="changeLimit(l)"
            class="limit-btn">
            Top {{ l }}
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading-rows">
        <div *ngFor="let i of [1,2,3,4,5]" class="skeleton-row"></div>
      </div>

      <!-- Table -->
      <div *ngIf="!loading && events.length > 0" class="table-wrapper">
        <table class="events-table">
          <thead>
            <tr>
              <th class="rank-col">#</th>
              <th>Evento</th>
              <th class="num-col">Tickets</th>
              <th class="num-col">Revenue</th>
              <th class="num-col">Comisión</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let event of events; let i = index" class="event-row" [class.top-3]="i < 3">
              <td class="rank-col">
                <span class="rank-badge" [class.gold]="i === 0" [class.silver]="i === 1" [class.bronze]="i === 2">
                  {{ i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : (i + 1))) }}
                </span>
              </td>
              <td class="event-info">
                <p class="event-title">{{ event.eventTitle }}</p>
                <p class="event-organizer">{{ event.organizer }}</p>
              </td>
              <td class="num-col">
                <span class="tickets-count">{{ event.ticketsSold }}</span>
              </td>
              <td class="num-col">
                <span class="revenue-value">{{ event.totalRevenue | currency }}</span>
              </td>
              <td class="num-col">
                <span class="commission-value">{{ event.platformCommission | currency }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && events.length === 0" class="empty-state">
        <svg class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p>No hay eventos con ventas registradas</p>
      </div>
    </div>
  `,
    styles: [`
    .top-events-container {
      background: white;
      border-radius: 1.5rem;
      border: 1px solid #f3f4f6;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }

    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #f3f4f6;
    }

    .table-title {
      font-size: 1rem;
      font-weight: 700;
      color: #111827;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .title-icon {
      font-size: 1.25rem;
    }

    .limit-selector {
      display: flex;
      gap: 0.5rem;
      background: #f3f4f6;
      padding: 0.25rem;
      border-radius: 0.75rem;
    }

    .limit-btn {
      padding: 0.375rem 0.75rem;
      border: none;
      background: transparent;
      border-radius: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .limit-btn:hover {
      color: #111827;
    }

    .limit-btn.active {
      background: white;
      color: #111827;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .loading-rows {
      padding: 1rem;
    }

    .skeleton-row {
      height: 56px;
      background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%);
      background-size: 400% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 0.75rem;
      margin-bottom: 0.5rem;
    }

    @keyframes shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    .table-wrapper {
      overflow-x: auto;
    }

    .events-table {
      width: 100%;
      border-collapse: collapse;
    }

    .events-table th {
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9ca3af;
      background: #f9fafb;
    }

    .events-table td {
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
    }

    .rank-col {
      width: 48px;
      text-align: center;
    }

    .num-col {
      text-align: right;
      width: 100px;
    }

    .rank-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 0.875rem;
      font-weight: 700;
      background: #f3f4f6;
      color: #6b7280;
    }

    .rank-badge.gold,
    .rank-badge.silver,
    .rank-badge.bronze {
      font-size: 1rem;
      background: transparent;
    }

    .event-row:hover {
      background: #f9fafb;
    }

    .event-row.top-3 {
      background: linear-gradient(90deg, rgba(139, 92, 246, 0.02), transparent);
    }

    .event-info {
      min-width: 200px;
    }

    .event-title {
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.25rem 0;
      font-size: 0.875rem;
    }

    .event-organizer {
      font-size: 0.75rem;
      color: #6b7280;
      margin: 0;
    }

    .tickets-count {
      font-weight: 600;
      color: #6B7280;
    }

    .revenue-value {
      font-weight: 700;
      color: #111827;
    }

    .commission-value {
      font-weight: 700;
      color: #10B981;
    }

    .empty-state {
      padding: 3rem;
      text-align: center;
      color: #9ca3af;
    }

    .empty-icon {
      width: 3rem;
      height: 3rem;
      margin: 0 auto 1rem;
    }

    .empty-state p {
      font-size: 0.875rem;
      margin: 0;
    }
  `]
})
export class TopEventsTableComponent implements OnInit {
    private adminService = inject(AdminService);

    @Input() dateRange?: DateRange;
    @Input() autoLoad = true;

    events: EventRanking[] = [];
    loading = false;
    limit = 5;
    limits = [5, 10, 20];

    ngOnInit(): void {
        if (this.autoLoad) {
            this.loadEvents();
        }
    }

    changeLimit(newLimit: number): void {
        this.limit = newLimit;
        this.loadEvents();
    }

    loadEvents(): void {
        this.loading = true;
        this.adminService.getTopEvents(this.limit, this.dateRange).subscribe({
            next: (response) => {
                if (response.success) {
                    this.events = response.data;
                }
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading top events:', err);
                this.loading = false;
            }
        });
    }
}

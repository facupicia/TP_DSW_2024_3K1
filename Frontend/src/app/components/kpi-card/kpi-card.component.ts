import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface KpiCardData {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: string;
    gradient: string;
    textColor: string;
}

@Component({
    selector: 'app-kpi-card',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="kpi-card" [ngClass]="data.gradient">
      <div class="flex items-center gap-4 mb-4">
        <div class="p-3 rounded-2xl" [ngClass]="'bg-' + data.textColor.split('-')[0] + '-500 text-white'">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="data.icon" />
          </svg>
        </div>
        <span [ngClass]="'text-' + data.textColor" class="font-medium text-sm uppercase tracking-wider">
          {{ data.title }}
        </span>
      </div>
      <p class="text-4xl font-bold" [ngClass]="'text-' + data.textColor.replace('600', '900').replace('700', '900')">
        {{ data.value }}
      </p>
      <p *ngIf="data.subtitle" class="text-sm mt-2" [ngClass]="'text-' + data.textColor">
        {{ data.subtitle }}
      </p>
    </div>
  `,
    styles: [`
    .kpi-card {
      @apply bg-white rounded-2xl border border-gray-100 shadow-sm p-6;
    }
  `]
})
export class KpiCardComponent {
    @Input() data!: KpiCardData;
}

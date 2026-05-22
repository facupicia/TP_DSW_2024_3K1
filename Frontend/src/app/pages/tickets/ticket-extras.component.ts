import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';

@Component({
  selector: 'app-ticket-extras',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe],
  templateUrl: './ticket-extras.component.html',
  styleUrls: ['./ticket-extras.component.css']
})
export class TicketExtrasComponent {
  @Input() extras: any[] = [];

  getProductName(extra: any): string {
    return extra.eventProduct?.product?.name ?? 'Extra';
  }

  getProductImage(extra: any): string {
    return extra.eventProduct?.product?.imageUrl
      || extra.eventProduct?.event?.image
      || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30';
  }

  getProductCategory(extra: any): string {
    return extra.eventProduct?.product?.category ?? 'other';
  }

  getProductDescription(extra: any): string {
    return extra.eventProduct?.product?.description ?? '';
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'used': return 'Canjeado';
      case 'cancelled': return 'Cancelado';
      default: return 'Activo';
    }
  }
}

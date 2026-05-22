import { Component, Input, Output, EventEmitter, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';

export type TicketDisplayStatus = 'active' | 'used' | 'past';

@Component({
  selector: 'app-ticket-flip-card',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './ticket-flip-card.component.html',
  styleUrls: ['./ticket-flip-card.component.css']
})
export class TicketFlipCardComponent {
  @Input() ticket!: any;
  @Input() group!: any;
  @Input() status: TicketDisplayStatus = 'active';
  @Output() onShare = new EventEmitter<void>();

  @ViewChild('cardInner') cardInner!: ElementRef;

  isFlipped = false;

  // Variables para el efecto tilt 3D en el frente
  rotateX = 0;
  rotateY = 0;
  shineX = 0;
  shineY = 0;
  isHovering = false;

  get eventTitle(): string {
    return this.group?.eventTitle || this.ticket?.event?.title || 'Evento';
  }

  get eventImage(): string {
    return this.group?.eventImage || this.ticket?.event?.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30';
  }

  get eventDate(): string {
    return this.group?.eventDate || this.ticket?.event?.date || '';
  }

  get eventTime(): string {
    return this.ticket?.event?.time || '';
  }

  get eventLocation(): string {
    return this.group?.ciudad || this.ticket?.event?.ciudad || '';
  }

  get ticketTypeName(): string {
    return this.ticket?.ticketType?.name || 'General';
  }

  get seatLabel(): string {
    return this.ticket?.seat || 'General';
  }

  get uniqueCode(): string {
    return this.ticket?.codigo_unico || '';
  }

  get qrCode(): string {
    return this.ticket?.qrCode || '';
  }

  @HostListener('click')
  onCardClick() {
    if (this.status === 'active') {
      this.isFlipped = !this.isFlipped;
    }
  }

  compartir(event: MouseEvent) {
    event.stopPropagation();
    this.onShare.emit();
  }

  // Efecto tilt 3D solo cuando no está flippeada y en desktop
  onMouseMove(e: MouseEvent) {
    if (this.isFlipped || window.innerWidth < 768) return;
    if (!this.cardInner) return;

    const rect = this.cardInner.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    this.rotateY = ((x - centerX) / centerX) * 12;
    this.rotateX = ((centerY - y) / centerY) * 12;
    this.shineX = (x / rect.width) * 100;
    this.shineY = (y / rect.height) * 100;
    this.isHovering = true;
  }

  onMouseLeave() {
    this.rotateX = 0;
    this.rotateY = 0;
    this.isHovering = false;
  }
}

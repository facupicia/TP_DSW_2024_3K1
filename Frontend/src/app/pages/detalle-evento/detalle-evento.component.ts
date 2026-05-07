import { Component, inject, Input, OnInit, OnDestroy } from '@angular/core';
import { EventService } from '../../services/event.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Evento } from '../../interfaces/event';
import { HeaderComponent } from '../../components/header/header.component';
import { ToastService } from '../../services/toast.service';
import { interval, Subscription } from 'rxjs';
import { EventImageFallbackDirective } from '../../directives/event-image-fallback.directive';

@Component({
    selector: 'app-detalle-evento',
    imports: [CommonModule, HeaderComponent, NgOptimizedImage, EventImageFallbackDirective],
    templateUrl: './detalle-evento.component.html',
    styleUrl: './detalle-evento.component.css'
})
export class DetalleEventoComponent implements OnInit, OnDestroy {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private eventoService = inject(EventService);
  private accesService = inject(AuthService);
  private toastService = inject(ToastService);
  private eventId: string | null = null;
  private promoterCode: string | null = null;

  isLoggedIn = false;
  user: any;
  evento: any;
  imgPerfil: string | null = null;
  loading = true;

  // Countdown Logic
  countdownSubscription!: Subscription;
  timeRemaining = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  isEventStarted = false;

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.eventId = idParam;

    // Check for promoter code in URL query params
    this.promoterCode = this.route.snapshot.queryParamMap.get('promo');

    if (!this.eventId || isNaN(Number(this.eventId)) || Number(this.eventId) <= 0) {
      this.router.navigate(['/events']);
      return;
    }

    this.cargarEvento(Number(this.eventId));
    this.accesService.ensureCurrentUser().subscribe(user => {
      this.isLoggedIn = !!user;
    });
  }

  ngOnDestroy(): void {
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }
  }

  cargarEvento(id: number) {
    this.loading = true;
    
    this.eventoService.obtenerEvento(id).subscribe({
      next: (data) => {
        this.evento = data;
        if (data.user) {
          this.user = data.user;
          this.imgPerfil = data.user.imgPerfil;
        }
        this.startCountdown();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toastService.error('No se pudo cargar el evento');
        this.router.navigate(['/events']);
      }
    });
  }

  startCountdown() {
    if (!this.evento?.date || !this.evento?.time) return;

    const eventDate = new Date(`${this.evento.date}T${this.evento.time}`);

    this.countdownSubscription = interval(1000).subscribe(() => {
      const now = new Date().getTime();
      const distance = eventDate.getTime() - now;

      if (distance < 0) {
        this.isEventStarted = true;
        this.timeRemaining = { days: 0, hours: 0, minutes: 0, seconds: 0 };
        return;
      }

      this.timeRemaining = {
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      };
    });
  }

  getGoogleMapsUrl(location: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  }

  addToCalendar() {
    const { title, description, location, date, time } = this.evento;
    const startDate = new Date(date + 'T' + time);
    const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));
    const format = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}&dates=${format(startDate)}/${format(endDate)}`;
    window.open(googleUrl, '_blank', 'noopener,noreferrer');
  }

  shareEvent() {
    if (navigator.share) {
      navigator.share({
        title: this.evento.title,
        text: `¡Mira este evento! ${this.evento.title}`,
        url: window.location.href
      }).catch(() => { });
    } else {
      navigator.clipboard.writeText(window.location.href);
      this.toastService.info('Enlace copiado al portapapeles');
    }
  }

  getMinPrice(): number {
    if (this.evento?.ticketTypes && this.evento.ticketTypes.length > 0) {
      return Math.min(...this.evento.ticketTypes.map((t: any) => Number(t.price)));
    }
    return 0;
  }

  isEventPast(): boolean {
    if (!this.evento?.date || !this.evento?.time) return false;
    const eventDateTime = new Date(`${this.evento.date}T${this.evento.time}`);
    return new Date() > eventDateTime;
  }

  getButtonState(): { disabled: boolean; text: string; class: string } {
    if (this.isEventPast()) {
      return {
        disabled: true,
        text: 'Evento Finalizado',
        class: 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-200'
      };
    }
    return {
      disabled: false,
      text: 'Comprar Entradas',
      class: 'bg-black text-white hover:bg-gray-900 shadow-xl shadow-gray-900/20'
    };
  }

  private calculateAge(birthDate: Date): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  reservarEntrada(eventId: number): void {
    this.accesService.ensureCurrentUser().subscribe({
      next: (profile) => {
        if (!profile) {
          const queryParams = this.promoterCode ? { promo: this.promoterCode } : {};
          this.router.navigate([`/ticket/${eventId}`], { queryParams });
          return;
        }

        if (this.evento?.minAge && this.evento.minAge > 0 && profile?.birth) {
          const userAge = this.calculateAge(profile.birth);
          if (userAge < this.evento.minAge) {
            this.toastService.warning(`Evento para +${this.evento.minAge} años. Tienes ${userAge}.`);
            return;
          }
        }

        // Navigate to checkout with promoter code if present
        const queryParams = this.promoterCode ? { promo: this.promoterCode } : {};
        this.router.navigate([`/ticket/${eventId}`], { queryParams });
      },
      error: () => {
      const queryParams = this.promoterCode ? { promo: this.promoterCode } : {};
      this.router.navigate([`/ticket/${eventId}`], { queryParams });
      }
    });
  }
}

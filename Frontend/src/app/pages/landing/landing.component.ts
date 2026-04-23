import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common'; // Agregamos DatePipe para las fechas
import { Router, RouterLink } from '@angular/router'; // RouterLink es vital para el HTML
import { PLATFORM_ID } from '@angular/core';

// Tus componentes (si los usas dentro, aunque ahora el HTML tiene el diseño directo)
import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { EventService } from '../../services/event.service';
import { Evento } from '../../interfaces/event';
import { SubscriptionLandingComponent } from '../../components/subscription-banner/subscription-landing.component';
import { LandingFinanzasComponent } from '../../components/features/finanzas/finanzas';
import { LandingVentaComponent } from '../../components/features/venta/venta';
import { LandingGestionComponent } from '../../components/features/gestion/gestion';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    HeaderComponent,
    FooterComponent,
    CommonModule, // Para *ngFor, *ngIf
    RouterLink,   // Para routerLink=""
    DatePipe,     // Para el pipe | date
    SubscriptionLandingComponent,
    LandingFinanzasComponent,
    LandingVentaComponent,
    LandingGestionComponent
  ],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);

  activeSection: string = 'inicio';
  scrollProgress: number = 0;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const sections = ['inicio', 'servicios', 'tendencias', 'ventajas'];
    const scrollPosition = window.pageYOffset + window.innerHeight / 2;

    // Actualizar sección activa
    for (const section of sections) {
      const element = document.getElementById(section);
      if (element) {
        const { top, bottom } = element.getBoundingClientRect();
        const absoluteTop = top + window.pageYOffset;
        const absoluteBottom = bottom + window.pageYOffset;

        if (scrollPosition >= absoluteTop && scrollPosition < absoluteBottom) {
          this.activeSection = section;
        }
      }
    }

    // Calcular progreso total de la página (para la línea vertical)
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    this.scrollProgress = (winScroll / height) * 100;
  }

  // Función para scroll suave manual
  scrollTo(sectionId: string, event: Event) {
    event.preventDefault();
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Usamos una lista simple, sin grupos
  events: Evento[] = [];

  // Inyección de dependencias
  constructor(private eventService: EventService, private router: Router) { }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Carga simple y directa de datos
    this.eventService.obtenerEventos().subscribe((data) => {
      this.events = data;
      // ¡Adiós a this.groupEvents()! Ya no se necesita.
    });
  }

  navigateToEvent(id: number | undefined): void {
    if (id) {
      this.router.navigate(['/event', id]);
    }
  }

  crearEvento() {
    this.router.navigate(['/create-event']);
  }
}

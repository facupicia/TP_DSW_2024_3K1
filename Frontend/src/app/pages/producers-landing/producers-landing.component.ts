import { Component, inject, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-producers-landing',
    imports: [CommonModule, RouterModule],
    templateUrl: './producers-landing.component.html',
    styleUrls: ['./producers-landing.component.css']
})
export class ProducersLandingComponent implements OnInit, AfterViewInit {
    private authService = inject(AuthService);
    private router = inject(Router);
    private platformId = inject(PLATFORM_ID);

    isLoggedIn = false;
    isOrganizer = false;

    features = [
        {
            icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
            title: 'Publicación gratuita',
            desc: 'Creá y publicá tus eventos sin costos iniciales. Solo pagás cuando vendés entradas.'
        },
        {
            icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
            title: 'Estadísticas en tiempo real',
            desc: 'Dashboard con KPIs, gráficos de ventas, evolución de ingresos y check-ins en vivo (SSE cada 15s).'
        },
        {
            icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
            title: 'Pagos con MercadoPago',
            desc: 'Integración segura con MercadoPago. Tus clientes pagan con tarjeta, débito o dinero en cuenta.'
        },
        {
            icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
            title: 'Gestión de entradas',
            desc: 'Múltiples tipos de entrada, control de stock, precios variables y cupones de descuento.'
        },
        {
            icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
            title: 'Escáner QR integrado',
            desc: 'Validá entradas en puerta con el escáner QR. Gestión de múltiples scanners por evento.'
        },
        {
            icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
            title: 'Red de promotores (RRPP)',
            desc: 'Asigná promotores con comisiones personalizadas, seguimiento de ventas y links de invitación.'
        },
        {
            icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
            title: 'Invitaciones y cortesías',
            desc: 'Enviá entradas gratuitas por email a invitados especiales con códigos QR únicos.'
        },
        {
            icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
            title: 'Anti-fraude',
            desc: 'Códigos QR únicos por ticket, validación en tiempo real y control de reventa.'
        }
    ];

    steps = [
        {
            num: '01',
            title: 'Creá',
            desc: 'Configurá tu evento en minutos: fecha, ubicación, tipos de entrada y visuales.'
        },
        {
            num: '02',
            title: 'Promocioná',
            desc: 'Compartí tu evento, activá promotores, enviá cupones de descuento y llegá a más gente.'
        },
        {
            num: '03',
            title: 'Validá',
            desc: 'Escaneá entradas en puerta, monitoreá ingresos en tiempo real y disfrutá tu evento.'
        }
    ];

    ngOnInit(): void {
        if (!isPlatformBrowser(this.platformId)) return;

        this.authService.ensureCurrentUser().subscribe(user => {
            this.isLoggedIn = !!user;
            if (user) {
                const roles = user.roles || [user.rol] || ['user'];
                this.isOrganizer = roles.some((r: string) => ['organizer', 'admin'].includes(r));
            }
        });
    }

    ngAfterViewInit(): void {
        if (!isPlatformBrowser(this.platformId)) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        const animatedElements = document.querySelectorAll('.animate-on-scroll');
        animatedElements.forEach(el => observer.observe(el));
    }

    goToAction(): void {
        if (this.isOrganizer) {
            this.router.navigate(['/my-events']);
        } else if (this.isLoggedIn) {
            this.router.navigate(['/create-event']);
        } else {
            this.router.navigate(['/register']);
        }
    }
}

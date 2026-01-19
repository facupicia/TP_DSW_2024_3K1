import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../../components/header/header.component';
import { CouponService, Coupon } from '../../services/coupon.service';
import { TicketService } from '../../services/ticket.service';
import { EventService } from '../../services/event.service';
import { ToastService } from '../../services/toast.service';
import { Evento, TicketType } from '../../interfaces/event';

@Component({
    selector: 'app-event-config',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, HeaderComponent],
    templateUrl: './event-config.component.html',
    styleUrls: ['./event-config.component.css']
})
export class EventConfigComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private couponService = inject(CouponService);
    private ticketService = inject(TicketService);
    private eventService = inject(EventService);
    private toastService = inject(ToastService);

    eventId!: number;
    event: Evento | null = null;
    isLoading = true;

    // Active tab
    activeTab: 'coupons' | 'invitations' = 'coupons';

    // Coupons
    coupons: Coupon[] = [];
    loadingCoupons = false;
    showCouponForm = false;
    newCoupon = {
        code: '',
        discountPercent: 10,
        maxUses: 0,
        expiresAt: ''
    };
    creatingCoupon = false;

    // Invitations
    inviteEmails = '';
    selectedTicketTypeId: number | null = null;
    sendingInvites = false;
    inviteResults: { success: number; errors: string[] } | null = null;

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        if (!idParam || isNaN(Number(idParam)) || Number(idParam) <= 0) {
            this.router.navigate(['/my-events']);
            return;
        }
        this.eventId = Number(idParam);
        this.loadEvent();
        this.loadCoupons();
    }

    loadEvent(): void {
        this.eventService.obtenerEvento(this.eventId).subscribe({
            next: (event) => {
                this.event = event;
                this.isLoading = false;
                // Auto-select first ticket type
                if (event.ticketTypes && event.ticketTypes.length > 0) {
                    this.selectedTicketTypeId = event.ticketTypes[0].id || null;
                }
            },
            error: () => {
                this.isLoading = false;
                this.router.navigate(['/my-events']);
            }
        });
    }

    loadCoupons(): void {
        this.loadingCoupons = true;
        this.couponService.getCouponsByEvent(this.eventId).subscribe({
            next: (coupons) => {
                this.coupons = coupons;
                this.loadingCoupons = false;
            },
            error: () => {
                this.loadingCoupons = false;
            }
        });
    }

    // ========== COUPONS ==========

    createCoupon(): void {
        if (!this.newCoupon.code.trim()) {
            this.toastService.warning('Ingresa un código para el cupón');
            return;
        }

        this.creatingCoupon = true;
        this.couponService.createCoupon({
            code: this.newCoupon.code.toUpperCase(),
            discountPercent: this.newCoupon.discountPercent,
            maxUses: this.newCoupon.maxUses || 0,
            expiresAt: this.newCoupon.expiresAt || null,
            eventId: this.eventId,
            isActive: true
        }).subscribe({
            next: (coupon) => {
                this.coupons.unshift(coupon);
                this.resetCouponForm();
                this.toastService.success('Cupón creado correctamente');
                this.creatingCoupon = false;
            },
            error: (err) => {
                this.toastService.error(err.error?.message || 'Error al crear cupón');
                this.creatingCoupon = false;
            }
        });
    }

    toggleCoupon(coupon: Coupon): void {
        this.couponService.toggleCoupon(coupon.id!).subscribe({
            next: (updated) => {
                const idx = this.coupons.findIndex(c => c.id === coupon.id);
                if (idx >= 0) this.coupons[idx] = updated;
                this.toastService.success(updated.isActive ? 'Cupón activado' : 'Cupón desactivado');
            },
            error: () => {
                this.toastService.error('Error al modificar cupón');
            }
        });
    }

    deleteCoupon(coupon: Coupon): void {
        if (!confirm(`¿Eliminar el cupón "${coupon.code}"?`)) return;

        this.couponService.deleteCoupon(coupon.id!).subscribe({
            next: () => {
                this.coupons = this.coupons.filter(c => c.id !== coupon.id);
                this.toastService.success('Cupón eliminado');
            },
            error: () => {
                this.toastService.error('Error al eliminar cupón');
            }
        });
    }

    resetCouponForm(): void {
        this.newCoupon = { code: '', discountPercent: 10, maxUses: 0, expiresAt: '' };
        this.showCouponForm = false;
    }

    // ========== INVITATIONS ==========

    sendInvitations(): void {
        if (!this.selectedTicketTypeId) {
            this.toastService.warning('Selecciona un tipo de entrada');
            return;
        }

        const emailsRaw = this.inviteEmails.trim();
        if (!emailsRaw) {
            this.toastService.warning('Ingresa al menos un email');
            return;
        }

        // Parse emails (comma, semicolon, or newline separated)
        const emails = emailsRaw
            .split(/[,;\n]+/)
            .map(e => e.trim().toLowerCase())
            .filter(e => e.length > 0);

        if (emails.length === 0) {
            this.toastService.warning('No se encontraron emails válidos');
            return;
        }

        this.sendingInvites = true;
        this.inviteResults = null;

        this.ticketService.inviteGuests(this.selectedTicketTypeId, emails).subscribe({
            next: (result: any) => {
                this.inviteResults = {
                    success: result.tickets?.length || 0,
                    errors: result.errors || []
                };
                this.toastService.success(result.message);
                this.inviteEmails = '';
                this.sendingInvites = false;
            },
            error: (err) => {
                this.toastService.error(err.error?.message || 'Error al enviar invitaciones');
                this.sendingInvites = false;
            }
        });
    }

    goBack(): void {
        this.router.navigate(['/my-events']);
    }
}

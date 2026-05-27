import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../../components/header/header.component';
import { CouponService, Coupon } from '../../services/coupon.service';
import { TicketService } from '../../services/ticket.service';
import { EventService } from '../../services/event.service';
import { ToastService } from '../../services/toast.service';
import { ProductService } from '../../services/product.service';
import { ExtraService } from '../../services/extra.service';
import { Evento, TicketType } from '../../interfaces/event';
import { Product, EventProduct } from '../../interfaces/product';

@Component({
    selector: 'app-event-config',
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
    private productService = inject(ProductService);
    private extraService = inject(ExtraService);
    private destroyRef = inject(DestroyRef);

    eventId!: number;
    event: Evento | null = null;
    isLoading = true;

    // Active tab
    activeTab: 'coupons' | 'invitations' | 'extras' = 'coupons';

    // Extras
    catalog: Product[] = [];
    eventExtras: EventProduct[] = [];
    loadingExtras = false;
    showExtraForm = false;
    selectedProductId: number | null = null;
    newExtraPrice: number = 0;
    newExtraHasStock = false;
    newExtraStock = 0;
    newExtraMaxPerOrder = 10;

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
    inviteQuantity = 1;
    sendingInvites = false;
    inviteResults: { success: number; totalTickets: number; errors: string[] } | null = null;

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        if (!idParam || isNaN(Number(idParam)) || Number(idParam) <= 0) {
            this.router.navigate(['/my-events']);
            return;
        }
        this.eventId = Number(idParam);
        this.loadEvent();
        this.loadCoupons();
        this.loadCatalog();
        this.loadEventExtras();
    }

    loadEvent(): void {
        this.eventService.obtenerEvento(this.eventId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
        this.couponService.getCouponsByEvent(this.eventId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
        this.couponService.toggleCoupon(coupon.id!).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

        this.couponService.deleteCoupon(coupon.id!).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

        this.ticketService.inviteGuests(this.selectedTicketTypeId, emails, this.inviteQuantity).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (result: any) => {
                this.inviteResults = {
                    success: result.tickets?.length || 0,
                    totalTickets: result.totalTickets || 0,
                    errors: result.errors || []
                };
                this.toastService.success(result.message);
                this.inviteEmails = '';
                this.sendingInvites = false;
                // Reload event to update stock display
                this.loadEvent();
            },
            error: (err: any) => {
                this.toastService.error(err.error?.message || 'Error al enviar invitaciones');
                this.sendingInvites = false;
            }
        });
    }

    // ========== EXTRAS ==========

    loadCatalog(): void {
        this.productService.getMyCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (products) => { this.catalog = products; },
            error: () => { /* ignore */ }
        });
    }

    loadEventExtras(): void {
        this.loadingExtras = true;
        this.extraService.getEventExtras(this.eventId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (extras) => {
                this.eventExtras = extras;
                this.loadingExtras = false;
            },
            error: () => {
                this.loadingExtras = false;
            }
        });
    }

    openExtraForm(): void {
        this.showExtraForm = true;
        this.selectedProductId = null;
        this.newExtraPrice = 0;
        this.newExtraHasStock = false;
        this.newExtraStock = 0;
        this.newExtraMaxPerOrder = 10;
    }

    addExtra(): void {
        if (!this.selectedProductId) {
            this.toastService.warning('Selecciona un producto del catálogo');
            return;
        }
        if (this.newExtraPrice == null || this.newExtraPrice < 0) {
            this.toastService.warning('Ingresa un precio válido');
            return;
        }

        const product = this.catalog.find(p => p.id === this.selectedProductId);
        if (!product) return;

        this.extraService.addExtraToEvent(this.eventId, {
            productId: this.selectedProductId,
            eventPrice: this.newExtraPrice,
            hasStock: this.newExtraHasStock,
            stock: this.newExtraHasStock ? this.newExtraStock : undefined,
            maxPerOrder: this.newExtraMaxPerOrder
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => {
                this.toastService.success(`"${product.name}" agregado al evento`);
                this.showExtraForm = false;
                this.loadEventExtras();
            },
            error: (err) => {
                this.toastService.error(err.error?.message || 'Error al agregar extra');
            }
        });
    }

    toggleExtra(extra: EventProduct): void {
        this.extraService.updateEventExtra(extra.id, { isActive: !extra.isActive }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => {
                this.toastService.success(extra.isActive ? 'Extra desactivado' : 'Extra activado');
                this.loadEventExtras();
            },
            error: () => this.toastService.error('Error al actualizar extra')
        });
    }

    removeExtra(extra: EventProduct): void {
        if (!confirm(`¿Eliminar "${extra.product.name}" de este evento?`)) return;
        this.extraService.removeExtraFromEvent(extra.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => {
                this.toastService.success('Extra eliminado del evento');
                this.loadEventExtras();
            },
            error: () => this.toastService.error('Error al eliminar extra')
        });
    }

    goBack(): void {
        this.router.navigate(['/my-events']);
    }
}

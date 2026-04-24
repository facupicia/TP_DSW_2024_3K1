import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    private toastr = inject(ToastrService);
    
    // Track last toast to prevent duplicates
    private lastToast: { message: string; title: string; type: string; time: number } | null = null;
    private readonly DEBOUNCE_MS = 3000; // 3 seconds debounce

    private normalizeText(value: unknown): string {
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object') {
            const maybeMessage = (value as any).message || (value as any).error?.message || (value as any).error;
            if (typeof maybeMessage === 'string') return maybeMessage;
            try {
                return JSON.stringify(value);
            } catch {
                return 'Ocurrió un error inesperado';
            }
        }
        return String(value ?? 'Ocurrió un error inesperado');
    }

    private shouldShowToast(message: string, title: string, type: string): boolean {
        const now = Date.now();
        
        // Check if this is the same as the last toast within debounce window
        if (this.lastToast &&
            this.lastToast.message === message &&
            this.lastToast.title === title &&
            this.lastToast.type === type &&
            (now - this.lastToast.time) < this.DEBOUNCE_MS) {
            return false; // Duplicate detected, don't show
        }
        
        // Update last toast
        this.lastToast = { message, title, type, time: now };
        return true;
    }

    success(message: unknown, title: string = 'Éxito') {
        const text = this.normalizeText(message);
        if (this.shouldShowToast(text, title, 'success')) {
            this.toastr.success(text, title);
        }
    }

    error(message: unknown, title: string = 'Error') {
        const text = this.normalizeText(message);
        if (this.shouldShowToast(text, title, 'error')) {
            this.toastr.error(text, title);
        }
    }

    warning(message: unknown, title: string = 'Advertencia') {
        const text = this.normalizeText(message);
        if (this.shouldShowToast(text, title, 'warning')) {
            this.toastr.warning(text, title);
        }
    }

    info(message: unknown, title: string = 'Información') {
        const text = this.normalizeText(message);
        if (this.shouldShowToast(text, title, 'info')) {
            this.toastr.info(text, title);
        }
    }
}

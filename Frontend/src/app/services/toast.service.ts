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

    success(message: string, title: string = 'Éxito') {
        if (this.shouldShowToast(message, title, 'success')) {
            this.toastr.success(message, title);
        }
    }

    error(message: string, title: string = 'Error') {
        if (this.shouldShowToast(message, title, 'error')) {
            this.toastr.error(message, title);
        }
    }

    warning(message: string, title: string = 'Advertencia') {
        if (this.shouldShowToast(message, title, 'warning')) {
            this.toastr.warning(message, title);
        }
    }

    info(message: string, title: string = 'Información') {
        if (this.shouldShowToast(message, title, 'info')) {
            this.toastr.info(message, title);
        }
    }
}

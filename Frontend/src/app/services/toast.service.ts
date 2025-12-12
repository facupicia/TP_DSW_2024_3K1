import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    private toastr = inject(ToastrService);

    success(message: string, title: string = 'Éxito') {
        this.toastr.success(message, title);
    }

    error(message: string, title: string = 'Error') {
        this.toastr.error(message, title);
    }

    warning(message: string, title: string = 'Advertencia') {
        this.toastr.warning(message, title);
    }

    info(message: string, title: string = 'Información') {
        this.toastr.info(message, title);
    }
}

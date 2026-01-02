import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { ScannerService } from '../../services/scanner.service';
import { ToastService } from '../../services/toast.service';
import { BarcodeFormat } from '@zxing/library';

@Component({
    selector: 'app-scanner',
    standalone: true,
    imports: [CommonModule, ZXingScannerModule],
    templateUrl: './scanner.component.html',
    styleUrls: ['./scanner.component.css']
})
export class ScannerComponent {
    scannerService = inject(ScannerService);
    toastService = inject(ToastService);

    allowedFormats = [BarcodeFormat.QR_CODE];
    hasDevices: boolean = false;
    hasPermission: boolean = false;

    scanResult: any = null;
    scanHistory: any[] = [];
    isProcessing: boolean = false;

    // Controls for camera
    enableScanner: boolean = true;

    constructor() {
        this.loadHistory();
    }

    loadHistory() {
        this.scannerService.getHistory().subscribe({
            next: (data) => this.scanHistory = data,
            error: (err) => console.error(err)
        });
    }

    onCamerasFound(devices: MediaDeviceInfo[]): void {
        this.hasDevices = Boolean(devices && devices.length);
    }

    onHasPermission(has: boolean) {
        this.hasPermission = has;
    }

    onScanSuccess(resultString: string) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.enableScanner = false; // Pause scanning

        this.scannerService.validateTicket(resultString).subscribe({
            next: (res) => {
                this.scanResult = { status: 'success', ...res };
                this.toastService.success("Ticket válido");
                this.loadHistory();
                this.playAudio('success');
            },
            error: (err) => {
                const errorData = err.error || {};
                this.scanResult = {
                    status: 'error',
                    message: errorData.message || "Error desconocido",
                    ticket: errorData.ticket
                };
                this.toastService.error(this.scanResult.message);
                this.playAudio('error');
            },
            complete: () => {
                // Wait a bit before enabling scanner again or show modal
            }
        });
    }

    resetScan() {
        this.scanResult = null;
        this.isProcessing = false;
        this.enableScanner = true;
    }

    playAudio(type: 'success' | 'error') {
        // Optional: simple beep
    }
}

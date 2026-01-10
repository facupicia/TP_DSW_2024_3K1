import { Component, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { ScannerService } from '../../services/scanner.service';
import { ToastService } from '../../services/toast.service';
import { BarcodeFormat } from '@zxing/library';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-scanner',
    standalone: true,
    imports: [CommonModule, ZXingScannerModule, RouterLink],
    templateUrl: './scanner.component.html',
    styleUrls: ['./scanner.component.css']
})
export class ScannerComponent implements OnInit {
    scannerService = inject(ScannerService);
    toastService = inject(ToastService);

    allowedFormats = [BarcodeFormat.QR_CODE];

    // Hardware State
    hasDevices: boolean = false;
    hasPermission: boolean = false;
    torchEnabled: boolean = false;
    availableDevices: MediaDeviceInfo[] = [];
    currentDevice: MediaDeviceInfo | undefined;

    // Logic State
    scanResult: any = null;
    scanHistory: any[] = [];
    isProcessing: boolean = false;
    enableScanner: boolean = true;
    showResultModal: boolean = false;

    // Audio
    private audioSuccess = new Audio('assets/sounds/success.mp3'); // Asegúrate de tener estos mp3 o usa base64
    private audioError = new Audio('assets/sounds/error.mp3');

    constructor() {
        this.loadHistory();
    }

    ngOnInit() {
        // Preload sounds if needed
        this.audioSuccess.volume = 0.5;
        this.audioError.volume = 0.5;
    }

    loadHistory() {
        this.scannerService.getHistory().subscribe({
            next: (data) => this.scanHistory = data,
            error: (err) => console.error(err)
        });
    }

    onHasPermission(has: boolean) {
        this.hasPermission = has;
    }

    onCamerasFound(devices: MediaDeviceInfo[]): void {
        this.availableDevices = devices;
        this.hasDevices = Boolean(devices && devices.length);

        // Prefer rear camera (environment)
        const rearCamera = devices.find(device => /back|rear|environment/gi.test(device.label));
        this.currentDevice = rearCamera || devices[0];
    }

    toggleTorch() {
        this.torchEnabled = !this.torchEnabled;
    }

    switchCamera() {
        if (this.availableDevices.length > 1) {
            const index = this.availableDevices.indexOf(this.currentDevice!);
            const nextIndex = (index + 1) % this.availableDevices.length;
            this.currentDevice = this.availableDevices[nextIndex];
        }
    }

    onScanSuccess(resultString: string) {
        if (this.isProcessing) return;

        this.isProcessing = true;
        this.enableScanner = false;
        this.hapticFeedback();

        this.scannerService.validateTicket(resultString).subscribe({
            next: (res) => {
                this.scanResult = { status: 'success', ...res };
                this.playAudio('success');
                this.finishScanProcess();
            },
            error: (err) => {
                const errorData = err.error || {};
                this.scanResult = {
                    status: 'error',
                    message: errorData.message || "Error desconocido",
                    ticket: errorData.ticket
                };
                this.playAudio('error');
                this.finishScanProcess();
            }
        });
    }

    finishScanProcess() {
        this.showResultModal = true;
        this.loadHistory();
        // Keep isProcessing true until user dismisses modal to prevent accidental rescans
    }

    resetScan() {
        this.showResultModal = false;
        setTimeout(() => {
            this.scanResult = null;
            this.isProcessing = false;
            this.enableScanner = true;
        }, 300); // Wait for animation
    }

    hapticFeedback() {
        if (navigator.vibrate) {
            navigator.vibrate(50); // Short vibration
        }
    }

    playAudio(type: 'success' | 'error') {
        // Simple fallback beep if no file, or play the loaded audio
        // Here assuming we use the Audio objects defined above
        try {
            if (type === 'success') this.audioSuccess.play();
            else this.audioError.play();
        } catch (e) {
            console.log('Audio play failed', e);
        }
    }
}
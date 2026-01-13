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

    // Hardware
    hasDevices: boolean = false;
    hasPermission: boolean = false;
    torchEnabled: boolean = false;
    availableDevices: MediaDeviceInfo[] = [];
    currentDevice: MediaDeviceInfo | undefined;

    // Lógica de Escaneo Continuo
    scanResult: any = null;
    scanHistory: any[] = [];
    isProcessing: boolean = false;
    enableScanner: boolean = true; // SIEMPRE TRUE para evitar pantalla negra

    // Estados visuales
    flashState: 'idle' | 'success' | 'error' = 'idle';
    cooldownTimer: any;

    // Audio
    private audioSuccess = new Audio('assets/sounds/success.mp3');
    private audioError = new Audio('assets/sounds/error.mp3');

    constructor() {
        this.loadHistory();
    }

    ngOnInit() {
        this.audioSuccess.volume = 0.6;
        this.audioError.volume = 0.6;
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
        // Preferir cámara trasera
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
        // Si estamos en "cooldown" (los 3 segundos de espera), ignoramos nuevos códigos
        if (this.isProcessing) return;

        this.isProcessing = true;
        this.hapticFeedback();

        // NO DESACTIVAMOS LA CAMARA (enableScanner sigue true)

        this.scannerService.validateTicket(resultString).subscribe({
            next: (res) => {
                this.handleScanResult('success', res);
            },
            error: (err) => {
                const errorData = err.error || {};
                const res = {
                    status: 'error',
                    message: errorData.message || "Ticket Inválido o Error",
                    ticket: errorData.ticket // A veces devolvemos info del ticket aunque sea error (ej: ya usado)
                };
                this.handleScanResult('error', res);
            }
        });
    }

    handleScanResult(status: 'success' | 'error', data: any) {
        // 1. Feedback Inmediato
        this.playAudio(status);
        this.flashState = status; // Dispara el pantallazo verde/rojo

        // 2. Mostrar datos
        this.scanResult = { status, ...data };

        // 3. Actualizar Historial (sin recargar todo si es posible, o recargando)
        this.loadHistory();

        // 4. Iniciar Cooldown de 3 segundos
        if (this.cooldownTimer) clearTimeout(this.cooldownTimer);

        this.cooldownTimer = setTimeout(() => {
            this.resetScanner();
        }, 3000); // 3 segundos para leer, luego listo para el siguiente
    }

    resetScanner() {
        this.flashState = 'idle';
        this.scanResult = null;
        this.isProcessing = false;
        // La cámara nunca se apagó, así que ya está lista
    }

    hapticFeedback() {
        if (navigator.vibrate) navigator.vibrate(50);
    }

    playAudio(type: 'success' | 'error') {
        try {
            if (type === 'success') {
                this.audioSuccess.currentTime = 0;
                this.audioSuccess.play();
            } else {
                this.audioError.currentTime = 0;
                this.audioError.play();
            }
        } catch (e) { console.log('Audio error', e); }
    }
}
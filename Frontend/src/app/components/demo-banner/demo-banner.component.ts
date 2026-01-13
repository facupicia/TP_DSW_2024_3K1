import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-demo-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="demo-banner-container">
      <div class="demo-track">
        <div class="demo-content">
          <span *ngFor="let i of [1,2,3,4]">
            ⚠️ PROYECTO DEMOSTRATIVO — NO REALIZAR COMPRAS REALES — LOS EVENTOS SON FICTICIOS ⚠️
          </span>
        </div>
        <div class="demo-content">
          <span *ngFor="let i of [1,2,3,4]">
            ⚠️ PROYECTO DEMOSTRATIVO — NO REALIZAR COMPRAS REALES — LOS EVENTOS SON FICTICIOS ⚠️
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .demo-banner-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 32px; /* Altura del banner */
      background: #F59E0B; /* Ámbar de advertencia (o usa #000 para contraste máximo) */
      color: #000;
      z-index: 9999; /* Por encima de todo, incluso del Header */
      overflow: hidden;
      display: flex;
      align-items: center;
      font-family: monospace; /* Estilo "código" o técnico */
      font-weight: bold;
      font-size: 12px;
      letter-spacing: 1px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    .demo-track {
      display: flex;
      white-space: nowrap;
      animation: scroll 20s linear infinite; /* Ajusta la velocidad aquí */
    }

    .demo-content {
      display: flex;
      gap: 0;
    }

    .demo-content span {
      padding: 0 40px; /* Espacio entre las repeticiones */
    }

    /* Animación: Mueve el track hacia la IZQUIERDA (Estándar de lectura) */
    /* Si realmente lo quieres hacia la derecha, cambia translateX(-50%) a translateX(0) en el 'to' e invierte el 'from' */
    @keyframes scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
  `]
})
export class DemoBannerComponent {}
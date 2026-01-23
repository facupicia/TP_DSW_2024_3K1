import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';


@Component({
    selector: 'app-landing-gestion',
    standalone: true,
    imports: [CommonModule],
    template: `
    <section class="px-4 max-w-6xl mx-auto py-24 relative">
  <div class="flex flex-col md:flex-row-reverse items-center justify-between gap-16">
    
    <div class="md:w-1/2">
       <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full text-sm font-bold uppercase tracking-wider mb-6 border border-slate-200">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Live Dashboard
       </div>

      <h2 class="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight tracking-tight">
        Información estratégica <br/>
        <span class="text-blue-600">en tiempo real.</span>
      </h2>
      
      <p class="text-xl text-slate-600 leading-relaxed mb-8">
        Deja de adivinar cómo va tu venta. Accede a un panel de control profesional donde cada métrica cuenta. Desde la distribución de tickets hasta el ritmo de check-in, tienes el mando absoluto de la operación.
      </p>

      <div class="grid grid-cols-2 gap-6">
        <div class="border-l-4 border-blue-500 pl-4">
            <h4 class="font-bold text-slate-900">Analítica PRO</h4>
            <p class="text-sm text-slate-500">Previsiones de venta y comportamiento del usuario.</p>
        </div>
        <div class="border-l-4 border-green-500 pl-4">
            <h4 class="font-bold text-slate-900">Control de Acceso</h4>
            <p class="text-sm text-slate-500">Monitorea el ingreso a tu evento minuto a minuto.</p>
        </div>
      </div>
    </div>

    <div class="w-full md:w-5/12 flex justify-center items-center relative h-[400px]">
      
      <div class="relative w-full h-64 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner p-4 overflow-hidden">
          <div class="flex items-end justify-between h-full gap-2 opacity-20">
              <div class="w-full bg-slate-300 h-1/2 rounded-t-sm"></div>
              <div class="w-full bg-slate-300 h-3/4 rounded-t-sm"></div>
              <div class="w-full bg-slate-300 h-2/3 rounded-t-sm"></div>
              <div class="w-full bg-slate-300 h-full rounded-t-sm"></div>
              <div class="w-full bg-slate-300 h-1/3 rounded-t-sm"></div>
          </div>
      </div>

      <div class="absolute top-10 -left-6 w-40 bg-white rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.12)] p-4 border border-slate-100 transform -rotate-6 z-30 animate-[float_4s_infinite_ease-in-out]">
          <div class="flex items-center gap-2 mb-2">
              <div class="p-1.5 bg-blue-100 rounded-lg text-blue-600 text-xs">💰</div>
              <span class="text-[10px] font-bold text-slate-400 uppercase">Ingresos</span>
          </div>
          <div class="text-xl font-black text-slate-900">$30,000</div>
          <div class="w-full bg-blue-100 h-1 mt-3 rounded-full overflow-hidden">
              <div class="bg-blue-500 h-full w-2/3"></div>
          </div>
      </div>

      <div class="absolute -top-12 left-1/2 -translate-x-1/2 w-44 h-44 bg-white rounded-full shadow-[0_25px_50px_rgba(0,0,0,0.15)] border-8 border-slate-50 flex flex-col items-center justify-center z-40 transform hover:scale-105 transition-transform duration-500">
          <div class="relative w-28 h-28 rounded-full border-[12px] border-blue-500 border-t-orange-400 border-l-purple-500 flex items-center justify-center">
              <div class="text-center">
                  <span class="text-[10px] text-slate-400 font-bold block">TOTAL</span>
                  <span class="text-lg font-black text-slate-800">275</span>
              </div>
          </div>
          <div class="absolute -right-4 top-10 bg-orange-400 text-white text-[10px] px-2 py-1 rounded-md font-bold shadow-md">
            Campo 29%
          </div>
      </div>

      <div class="absolute bottom-10 -right-6 w-40 bg-white rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.12)] p-4 border border-slate-100 transform rotate-3 z-30 animate-[float_5s_infinite_ease-in-out_1s]">
          <div class="flex items-center gap-2 mb-2">
              <div class="p-1.5 bg-green-100 rounded-lg text-green-600 text-xs">🏢</div>
              <span class="text-[10px] font-bold text-slate-400 uppercase">Ocupación</span>
          </div>
          <div class="text-xl font-black text-slate-900">85%</div>
          <div class="flex gap-1 mt-2">
              <div class="h-1.5 w-full bg-green-500 rounded-full"></div>
              <div class="h-1.5 w-full bg-green-500 rounded-full"></div>
              <div class="h-1.5 w-full bg-green-200 rounded-full"></div>
          </div>
      </div>

    </div>
  </div>
</section>

<style>
  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(var(--tw-rotate)); }
    50% { transform: translateY(-15px) rotate(var(--tw-rotate)); }
  }
</style>
  `
})

export class LandingGestionComponent {
    constructor() { }
}
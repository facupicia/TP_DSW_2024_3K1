import { Component, Input } from '@angular/core';



@Component({
    selector: 'app-landing-finanzas',
    imports: [],
    template: `
<section class="px-4 max-w-6xl mx-auto -mt-16 relative z-40 pb-20">
  <div class="flex flex-col items-start justify-start mb-8">
    <span class="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-sm font-bold tracking-wider uppercase">
      Finanzas
    </span>
  </div>

  <div class="flex flex-col md:flex-row items-center justify-between gap-12">
    <div class="md:w-1/2">
      <h3 class="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight tracking-tight">
        Tu liquidez <span class="text-blue-600 italic">no espera</span> al evento.
      </h3>
      <p class="text-xl text-slate-600 leading-relaxed">
        Mientras otras plataformas retienen tu dinero por semanas, en <strong class="text-slate-900">EventLife</strong> lo tienes disponible al instante de cada venta. Control total de tu flujo de caja, sin vueltas.
      </p>
      
      <div class="mt-8 flex items-center gap-3 grayscale opacity-70 hover:grayscale-0 transition-all">
        <span class="text-sm font-semibold text-slate-400 uppercase tracking-widest">Powere by</span>
        <p class="text-sm font-semibold text-slate-900">Mercado Pago</p>
      </div>
    </div>

    <div class="w-full md:w-1/2 flex justify-center items-center -skew-y-12 ">
      <div class="relative w-72 h-72">
        <div class="absolute inset-0 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        
        <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-56 h-36 bg-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-10 p-5 overflow-hidden border border-slate-700">
          <div class="flex justify-between items-start">
            <div class="w-10 h-8 bg-gradient-to-tr from-yellow-500 to-yellow-200 rounded-md shadow-inner"></div>
            <div class="text-blue-500 font-black text-2xl tracking-tighter italic">EL</div>
          </div>
          <div class="mt-8">
            <div class="h-2 w-32 bg-slate-700 rounded mb-2"></div>
            <div class="h-2 w-20 bg-slate-800 rounded"></div>
          </div>
        </div>

        <div class="absolute top-4 right-12 w-14 h-14 bg-yellow-500 rounded-full border-4 border-white shadow-lg z-20 flex items-center justify-center animate-bounce">
          <span class="text-white font-bold text-xl">$</span>
        </div>
        <div class="absolute bottom-8 left-8 w-10 h-10 bg-yellow-400 rounded-full border-4 border-white shadow-md z-20 flex items-center justify-center text-white font-bold animate-[bounce_2s_infinite]">
          $
        </div>
        
        <div class="absolute -right-4 bottom-1/2 translate-y-1/2 text-blue-500 opacity-30">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 10V3L4 14H11V21L20 10H13Z" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</section>
  `
})

export class LandingFinanzasComponent {
  constructor() { }
}
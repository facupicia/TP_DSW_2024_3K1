import { Component, Input } from '@angular/core';



@Component({
    selector: 'app-landing-venta',
    imports: [],
    template: `
<section class="px-4 max-w-6xl mx-auto py-24 relative overflow-hidden">
  <div class="absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-96 h-96 bg-blue-50 rounded-full blur-3xl -z-10"></div>

  <div class="flex flex-col md:flex-row items-center justify-between gap-16">
    
    <div class="md:w-1/2 relative z-10">
       <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-bold uppercase tracking-wider mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clip-rule="evenodd" />
          </svg>
          Estrategia de Ventas
       </div>

      <h2 class="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight tracking-tight">
        Vende por tandas <br/>
        <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">maximiza ganancias.</span>
      </h2>
      
      <p class="text-xl text-slate-600 leading-relaxed mb-8">
        Configura "Early Birds", preventas y lotes generales. Automatiza el aumento de precios por fecha o cantidad vendida y asegurar un flujo de caja temprano.
      </p>

      <ul class="space-y-3">
        <li class="flex items-center gap-3 text-slate-700 font-medium">
           <div class="h-2 w-2 bg-blue-500 rounded-full"></div>
           Automatización por fecha o stock agotado.
        </li>
        <li class="flex items-center gap-3 text-slate-700 font-medium">
           <div class="h-2 w-2 bg-blue-500 rounded-full"></div>
           Aumenta el ticket promedio progresivamente.
        </li>
      </ul>
    </div>


    <div class="w-full md:w-5/12 flex justify-center items-center relative p-6 pt-16 pb-8 ">

  <div class="skew-y-12 relative w-full h-80 bg-white rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 p-8 flex items-end justify-around overflow-visible z-0">

    <div class="absolute inset-0 z-0 opacity-20 pointer-events-none overflow-hidden rounded-3xl">
      <svg class="w-full h-full" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M50 250 C 100 250, 150 180, 200 150 C 250 120, 300 50, 350 50" stroke="url(#paint0_linear)" stroke-width="4" stroke-linecap="round" />
        <defs>
          <linearGradient id="paint0_linear" x1="50" y1="250" x2="350" y2="50" gradientUnits="userSpaceOnUse">
            <stop stop-color="#3B82F6" />
            <stop offset="1" stop-color="#4F46E5" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    <div class="flex flex-col items-center relative z-20 group cursor-pointer -mt-16 transition-transform duration-300 hover:-translate-y-2">
      <div class="mb-3 px-3 py-1 bg-blue-100 text-blue-700 font-bold rounded-lg text-sm shadow-sm relative z-30">
        $25.00
      </div>
      <div class="w-16 h-24 bg-gradient-to-t from-blue-400 to-blue-300 rounded-t-xl shadow-[0_20px_25px_-10px_rgba(59,130,246,0.5)] group-hover:shadow-[0_25px_30px_-10px_rgba(59,130,246,0.6)] transition-all relative overflow-hidden">
        <div class="absolute bottom-0 left-0 w-full h-1 bg-blue-500 opacity-20"></div>
        <div class="absolute bottom-2 left-0 w-full h-1 bg-blue-500 opacity-20"></div>
      </div>
      <span class="mt-4 text-sm font-semibold text-slate-500 uppercase tracking-wider bg-white/80 backdrop-blur-sm px-2 rounded-full">Early Bird</span>
    </div>

    <div class="flex flex-col items-center relative z-20 group cursor-pointer -mt-24 transition-transform duration-300 hover:-translate-y-2">
      <div class="mb-3 px-3 py-1 bg-indigo-100 text-indigo-700 font-bold rounded-lg text-sm shadow-sm relative z-30">
        $45.00
      </div>
      <div class="w-16 h-40 bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-t-xl shadow-[0_20px_25px_-10px_rgba(99,102,241,0.5)] group-hover:shadow-[0_25px_30px_-10px_rgba(99,102,241,0.6)] transition-all relative overflow-hidden">
        <div class="absolute bottom-0 left-0 w-full h-1 bg-indigo-700 opacity-20"></div>
        <div class="absolute bottom-2 left-0 w-full h-1 bg-indigo-700 opacity-20"></div>
        <div class="absolute bottom-4 left-0 w-full h-1 bg-indigo-700 opacity-20"></div>
      </div>
      <span class="mt-4 text-sm font-semibold text-slate-500 uppercase tracking-wider bg-white/80 backdrop-blur-sm px-2 rounded-full">General</span>
    </div>

    <div class="flex flex-col items-center relative z-20 group cursor-pointer -mt-32 transition-transform duration-300 hover:-translate-y-2">
      <div class="absolute -top-6 right-0 animate-bounce z-40">
        <span class="text-3xl">🔥</span>
      </div>
      <div class="mb-3 px-3 py-1 bg-purple-100 text-purple-700 font-bold rounded-lg text-sm shadow-sm relative z-30">
        $75.00
      </div>
      <div class="w-16 h-56 bg-gradient-to-t from-purple-600 to-purple-500 rounded-t-xl shadow-[0_20px_25px_-10px_rgba(168,85,247,0.5)] group-hover:shadow-[0_25px_30px_-10px_rgba(168,85,247,0.6)] transition-all relative overflow-hidden">
        <div class="absolute bottom-0 left-0 w-full h-1 bg-purple-800 opacity-20"></div>
        <div class="absolute bottom-2 left-0 w-full h-1 bg-purple-800 opacity-20"></div>
        <div class="absolute bottom-4 left-0 w-full h-1 bg-purple-800 opacity-20"></div>
        <div class="absolute bottom-6 left-0 w-full h-1 bg-purple-800 opacity-20"></div>
      </div>
      <span class="mt-4 text-sm font-semibold text-slate-900 font-bold uppercase tracking-wider bg-white/80 backdrop-blur-sm px-2 rounded-full">Último Lote</span>
    </div>

  </div>
</div>

  </div>
</section>
  `
})

export class LandingVentaComponent {
    constructor() { }
}
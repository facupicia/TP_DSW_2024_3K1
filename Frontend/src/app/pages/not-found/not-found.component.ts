import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-not-found',
    imports: [RouterModule],
    template: `
        <div class="min-h-screen flex flex-col items-center justify-center text-center px-4">
            <h1 class="text-6xl font-bold text-gray-800 mb-4">404</h1>
            <p class="text-xl text-gray-600 mb-8">Página no encontrada</p>
            <a routerLink="/" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                Volver al inicio
            </a>
        </div>
    `
})
export class NotFoundComponent {}

import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core'; // Importar esta función
import { FormsModule } from '@angular/forms'; // Importa FormsModule
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';


import { provideAnimations } from '@angular/platform-browser/animations';
import { provideToastr } from 'ngx-toastr';
import { errorInterceptor } from './interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor]), withFetch()),
    provideAnimations(), // Required by Toastr
    provideToastr(), // Toastr providers
    importProvidersFrom(FormsModule) // Añadir FormsModule aquí
  ]
};

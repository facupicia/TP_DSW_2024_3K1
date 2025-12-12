import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core'; // Importar esta función
import { FormsModule } from '@angular/forms'; // Importa FormsModule
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';


export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withInterceptors([authInterceptor]), withFetch()),
    importProvidersFrom(FormsModule) // Añadir FormsModule aquí
  ]
};
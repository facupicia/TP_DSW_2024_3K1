import { ApplicationConfig, provideZoneChangeDetection, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/es-AR';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideNgxMask } from 'ngx-mask';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideToastr } from 'ngx-toastr';
import { errorInterceptor } from './interceptors/error.interceptor';
registerLocaleData(localeAr);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-AR' },
    provideZoneChangeDetection({ eventCoalescing: true, runCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor]), withFetch()),
    provideToastr({
      closeButton: true,
      preventDuplicates: true,
      progressBar: true
    }),
    provideNgxMask()
  ]
};

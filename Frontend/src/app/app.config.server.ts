import { provideServerRendering, withRoutes } from '@angular/ssr';
import { mergeApplicationConfig, ApplicationConfig, CSP_NONCE, REQUEST_CONTEXT, inject } from '@angular/core';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { DOCUMENT } from '@angular/common';

function requestNonce(): string | null {
  const nonce = (inject(REQUEST_CONTEXT) as { cspNonce?: string } | null)?.cspNonce || null;
  if (nonce) inject(DOCUMENT).getElementById('ng-event-dispatch-contract')?.setAttribute('nonce', nonce);
  return nonce;
}

const serverConfig: ApplicationConfig = {
  providers: [
    { provide: CSP_NONCE, useFactory: requestNonce },
    provideServerRendering(withRoutes(serverRoutes))
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

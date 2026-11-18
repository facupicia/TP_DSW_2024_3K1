import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { getAllowedHosts, getContext, getTrustProxyHeaders } from '@netlify/angular-runtime/app-engine.js';

const angularAppEngine = new AngularAppEngine({
  allowedHosts: process.env['SITE_NAME'] ? getAllowedHosts() : ['localhost', '127.0.0.1'],
  trustProxyHeaders: getTrustProxyHeaders(),
});

export async function netlifyAppEngineHandler(request: Request): Promise<Response> {
  const cspNonce = crypto.randomUUID().replaceAll('-', '');
  const response = await angularAppEngine.handle(request, { ...getContext(), cspNonce });
  if (!response) return new Response('Not found', { status: 404 });
  response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${cspNonce}' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://accounts.google.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:; img-src 'self' data: blob: https:; connect-src 'self' https://api.vidaeventofiesta.site http://localhost:3000 https://accounts.google.com; frame-src https://accounts.google.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`);
  response.headers.set('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const reqHandler = createRequestHandler(netlifyAppEngineHandler);

import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'events', renderMode: RenderMode.Server },
  { path: 'event/:id', renderMode: RenderMode.Server },
  {
    path: 'privacy',
    renderMode: RenderMode.Server
  },
  {
    path: 'terms',
    renderMode: RenderMode.Server
  },
  {
    path: 'support',
    renderMode: RenderMode.Server
  },
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];

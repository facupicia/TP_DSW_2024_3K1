import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { organizerGuard } from './guards/organizer.guard';
import { promoterGuard } from './guards/promoter.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
    { path: "", loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent), title: 'Home' },
    { path: "login", loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent), title: 'Login' },
    { path: "register", loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent), title: 'Register' },
    { path: "profile", loadComponent: () => import('./pages/perfil/perfil.component').then(m => m.PerfilComponent), title: 'Perfil', canActivate: [authGuard] },
    { path: "profile/:id", loadComponent: () => import('./pages/prefil-edit/prefil-edit.component').then(m => m.PrefilEditComponent), title: 'Editar Perfil', canActivate: [authGuard] },
    { path: "settings", loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent), title: 'Configuración', canActivate: [authGuard] },
    { path: "create-event", loadComponent: () => import('./pages/registrar-evento/registrar-evento.component').then(m => m.RegistrarEventoComponent), title: 'Crear Evento', canActivate: [authGuard] },
    { path: "my-events", loadComponent: () => import('./pages/mis-eventos/mis-eventos.component').then(m => m.MisEventosComponent), title: 'Mis Eventos', canActivate: [authGuard, organizerGuard] },
    { path: "edit-event/:id", loadComponent: () => import('./pages/registrar-evento/registrar-evento.component').then(m => m.RegistrarEventoComponent), title: 'Editar Evento', canActivate: [authGuard, organizerGuard] },
    { path: "event/:id", loadComponent: () => import('./pages/detalle-evento/detalle-evento.component').then(m => m.DetalleEventoComponent), title: 'Ver Evento' },
    { path: "events", loadComponent: () => import('./pages/explorador-eventos/explorador-eventos.component').then(m => m.ExploradorEventosComponent), title: 'Explorar Eventos' },
    { path: "ticket/:id", loadComponent: () => import('./pages/checkout/checkout.component').then(m => m.CheckoutComponent), title: 'Ticket', canActivate: [authGuard] },
    { path: "checkout/success", loadComponent: () => import('./pages/checkout/success.component').then(m => m.CheckoutSuccessComponent), title: 'Pago Exitoso' },
    { path: "checkout/failure", loadComponent: () => import('./pages/checkout/failure.component').then(m => m.CheckoutFailureComponent), title: 'Pago Fallido' },
    { path: "checkout/pending", loadComponent: () => import('./pages/checkout/pending.component').then(m => m.CheckoutPendingComponent), title: 'Pago Pendiente' },
    { path: "admin", loadComponent: () => import('./pages/admin-panel/admin-panel.component').then(m => m.AdminPanelComponent), title: 'Panel de Administración', canActivate: [authGuard, adminGuard] },
    { path: "my-tickets/:id", loadComponent: () => import('./pages/tickets/tickets.component').then(m => m.TicketsComponent), title: 'Mis Tickets', canActivate: [authGuard] },
    { path: "creator/stats", loadComponent: () => import('./pages/creator-stats/creator-stats.component').then(m => m.CreatorStatsComponent), title: 'Estadísticas', canActivate: [authGuard, organizerGuard] },
    { path: "event/:id/stats", loadComponent: () => import('./pages/event-stats/event-stats.component').then(m => m.EventStatsComponent), title: 'Estadísticas de Evento', canActivate: [authGuard, organizerGuard] },
    { path: "event/:id/config", loadComponent: () => import('./pages/event-config/event-config.component').then(m => m.EventConfigComponent), title: 'Configuración de Evento', canActivate: [authGuard, organizerGuard] },
    { path: "scanner", loadComponent: () => import('./pages/scanner/scanner.component').then(m => m.ScannerComponent), title: 'Escáner', canActivate: [authGuard] },

    // Promoter (RRPP) routes
    { path: "promoter/management", loadComponent: () => import('./pages/promoter-management/promoter-management.component').then(m => m.PromoterManagementComponent), title: 'Gestión de Promotores', canActivate: [authGuard, organizerGuard] },
    { path: "promoter/stats", loadComponent: () => import('./pages/promoter-stats/promoter-stats.component').then(m => m.PromoterStatsComponent), title: 'Estadísticas de Promotores', canActivate: [authGuard, organizerGuard] },
    { path: "promoter/:id/stats", loadComponent: () => import('./pages/promoter-stats/promoter-stats.component').then(m => m.PromoterStatsComponent), title: 'Detalle de Promotor', canActivate: [authGuard, organizerGuard] },
    { path: "promoter/dashboard", loadComponent: () => import('./pages/promoter-dashboard/promoter-dashboard.component').then(m => m.PromoterDashboardComponent), title: 'Panel de Promotor', canActivate: [authGuard, promoterGuard] },

    // Subscription routes - no authGuard because webhook handles activation
    { path: "subscription/callback", loadComponent: () => import('./pages/subscription-callback/subscription-callback.component').then(m => m.SubscriptionCallbackComponent), title: 'Verificando Suscripción' },

    { path: "**", redirectTo: "", pathMatch: "full" }
];

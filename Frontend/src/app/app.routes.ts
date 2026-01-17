import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { PerfilComponent } from './pages/perfil/perfil.component';
import { PrefilEditComponent } from './pages/prefil-edit/prefil-edit.component';
import { RegistrarEventoComponent } from './pages/registrar-evento/registrar-evento.component';
import { MisEventosComponent } from './pages/mis-eventos/mis-eventos.component';
import { DetalleEventoComponent } from './pages/detalle-evento/detalle-evento.component';
import { ExploradorEventosComponent } from './pages/explorador-eventos/explorador-eventos.component';
import { CheckoutComponent } from './pages/checkout/checkout.component';
import { AdminPanelComponent } from './pages/admin-panel/admin-panel.component';
import { TicketsComponent } from './pages/tickets/tickets.component';
import { CheckoutSuccessComponent } from './pages/checkout/success.component';
import { CheckoutFailureComponent } from './pages/checkout/failure.component';
import { CheckoutPendingComponent } from './pages/checkout/pending.component';
import { CreatorStatsComponent } from './pages/creator-stats/creator-stats.component';
import { EventStatsComponent } from './pages/event-stats/event-stats.component';
import { ScannerComponent } from './pages/scanner/scanner.component';
import { SubscriptionCallbackComponent } from './pages/subscription-callback/subscription-callback.component';


import { authGuard } from './guards/auth.guard';
import { organizerGuard } from './guards/organizer.guard';

export const routes: Routes = [
    { path: "", component: LandingComponent, title: 'Home' },
    { path: "login", component: LoginComponent, title: 'Login' },
    { path: "register", component: RegisterComponent, title: 'Register' },
    { path: "profile", component: PerfilComponent, title: 'Perfil', canActivate: [authGuard] },
    { path: "profile/:id", component: PrefilEditComponent, title: 'Editar Perfil', canActivate: [authGuard] },
    { path: "create-event", component: RegistrarEventoComponent, title: 'Crear Evento', canActivate: [authGuard] },
    { path: "my-events", component: MisEventosComponent, title: 'Mis Eventos', canActivate: [authGuard, organizerGuard] },
    { path: "edit-event/:id", component: RegistrarEventoComponent, title: 'Editar Evento', canActivate: [authGuard, organizerGuard] },
    { path: "event/:id", component: DetalleEventoComponent, title: 'Ver Evento' },
    { path: "events", component: ExploradorEventosComponent, title: 'Explorar Eventos' },
    { path: "ticket/:id", component: CheckoutComponent, title: 'Ticket', canActivate: [authGuard] },
    { path: "checkout/success", component: CheckoutSuccessComponent, title: 'Pago Exitoso' },
    { path: "checkout/failure", component: CheckoutFailureComponent, title: 'Pago Fallido' },
    { path: "checkout/pending", component: CheckoutPendingComponent, title: 'Pago Pendiente' },
    { path: "admin", component: AdminPanelComponent, title: 'Panel de Administración' },
    { path: "my-tickets/:id", component: TicketsComponent, title: 'Mis Tickets', canActivate: [authGuard] },
    { path: "creator/stats", component: CreatorStatsComponent, title: 'Estadísticas', canActivate: [authGuard, organizerGuard] },
    { path: "event/:id/stats", component: EventStatsComponent, title: 'Estadísticas de Evento', canActivate: [authGuard, organizerGuard] },
    { path: "scanner", component: ScannerComponent, title: 'Escáner', canActivate: [authGuard] },

    // Subscription routes - no authGuard because webhook handles activation
    // Users might land here from a different browser where they're not logged in
    { path: "subscription/callback", component: SubscriptionCallbackComponent, title: 'Verificando Suscripción' },

    { path: "**", redirectTo: "", pathMatch: "full" }
];

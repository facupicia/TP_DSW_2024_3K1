import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { PerfilComponent } from './pages/perfil/perfil.component';
import { PrefilEditComponent } from './pages/prefil-edit/prefil-edit.component';
import { RegistrarEventoComponent } from './pages/registrar-evento/registrar-evento.component';
import { MisEventosComponent } from './pages/mis-eventos/mis-eventos.component';
import { EditarEventoComponent } from './pages/editar-evento/editar-evento.component';
import { DetalleEventoComponent } from './pages/detalle-evento/detalle-evento.component';
import { ExploradorEventosComponent } from './pages/explorador-eventos/explorador-eventos.component';
import { CheckoutComponent } from './pages/checkout/checkout.component';
import { CategoryComponent } from './pages/category/category.component';
import { TicketsComponent } from './pages/tickets/tickets.component';


import { authGuard } from './guards/auth.guard'; // Importar el guard

export const routes: Routes = [
    { path: "", component: LandingComponent, title: 'Home' },
    { path: "login", component: LoginComponent, title: 'Login' },
    { path: "register", component: RegisterComponent, title: 'Register' },
    { path: "profile", component: PerfilComponent, title: 'Perfil', canActivate: [authGuard] },
    { path: "profile/:id", component: PrefilEditComponent, title: 'Editar Perfil', canActivate: [authGuard] },
    { path: "create-event", component: RegistrarEventoComponent, title: 'Crear Evento', canActivate: [authGuard] },
    { path: "my-events", component: MisEventosComponent, title: 'Mis Eventos', canActivate: [authGuard] },
    { path: "edit-event/:id", component: EditarEventoComponent, title: 'Editar Evento', canActivate: [authGuard] },
    { path: "event/:id", component: DetalleEventoComponent, title: 'Ver Evento' },
    { path: "events", component: ExploradorEventosComponent, title: 'Explorar Eventos' },
    { path: "ticket/:id", component: CheckoutComponent, title: 'Ticket', canActivate: [authGuard] },
    { path: "admin", component: CategoryComponent, title: 'Categorias Admin' },
    { path: "my-tickets/:id", component: TicketsComponent, title: 'Mis Tickets', canActivate: [authGuard] },

    { path: "**", redirectTo: "", pathMatch: "full" }
];

import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../services/category.service';
import { CommonModule } from '@angular/common';
import { Categoria } from '../../interfaces/categoria';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { StatsService } from '../../services/stats.service';
import { Usuario } from '../../interfaces/Usuario';
import { EventService } from '../../services/event.service';
import { AdminService, OverviewResponse, DateRange } from '../../services/admin.service';
import { DashboardOverviewComponent } from '../../components/dashboard-overview/dashboard-overview.component';
import { RevenueViewComponent } from '../../components/revenue-view/revenue-view.component';
import { SubscriptionChartComponent } from '../../components/subscription-chart/subscription-chart.component';
import { CurrencyFormatterPipe, PercentFormatterPipe } from '../../pipes/formatter.pipes';

type TabView = 'dashboard' | 'revenue' | 'subscriptions' | 'marketplace' | 'commissions' | 'users' | 'categories';
type DatePreset = 'today' | '7days' | '30days' | '90days' | 'all';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    DashboardOverviewComponent,
    RevenueViewComponent,
    SubscriptionChartComponent,
    CurrencyFormatterPipe,
    PercentFormatterPipe
  ],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css']
})
export class AdminPanelComponent implements OnInit {

  private userService = inject(AuthService);
  private categoryService = inject(CategoryService);
  private adminService = inject(AdminService);
  public formBuild = inject(FormBuilder);
  private toast = inject(ToastService);
  private statsService = inject(StatsService);
  private eventService = inject(EventService);

  public activeTab: TabView = 'dashboard';
  public isMobileNavOpen = false;
  public loadingCategories = false;
  public loadingUsers = false;
  public loadingMetrics = false;
  public updatingRole: Record<number, boolean> = {};
  public selectedRole: Record<number, 'user' | 'admin' | 'scanner'> = {};
  public roles: Array<'user' | 'admin' | 'scanner'> = ['user', 'admin', 'scanner'];
  public currentUser: any = null;

  // Date Range Filter
  public selectedDatePreset: DatePreset = 'all';
  public datePresets: { value: DatePreset; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: '7days', label: '7 días' },
    { value: '30days', label: '30 días' },
    { value: '90days', label: '90 días' },
    { value: 'all', label: 'Todo' }
  ];

  public formCategory: FormGroup = this.formBuild.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
  });

  categorias: Categoria[] = [];
  usuarios: Usuario[] = [];

  // Legacy stats (for backward compatibility)
  stats = {
    totalUsers: 0,
    totalCategories: 0,
    activeEvents: 0
  };

  // New comprehensive metrics
  overview: OverviewResponse | null = null;
  dateRange: DateRange | undefined = undefined;

  ngOnInit(): void {
    this.cargarCategorias();
    this.userService.currentUser$.subscribe(u => {
      this.currentUser = u;
    });

    this.cargarUsuarios();
    this.getEvents();
    this.loadOverview();
  }

  /**
   * Load comprehensive overview metrics
   */
  loadOverview() {
    this.loadingMetrics = true;
    this.adminService.getOverview(this.dateRange).subscribe({
      next: (response) => {
        if (response.success) {
          this.overview = response.data;
          // Update legacy stats for backward compatibility
          this.stats.totalUsers = response.data.users.totalUsers;
          this.stats.activeEvents = response.data.events.activeEvents;
        }
        this.loadingMetrics = false;
      },
      error: (err) => {
        console.error('Error loading overview:', err);
        this.toast.error('Error al cargar métricas del panel');
        this.loadingMetrics = false;
      }
    });
  }

  getEvents() {
    this.eventService.getEventsNumber().subscribe({
      next: (data) => {
        this.stats.activeEvents = data;
        console.log(this.stats.activeEvents);
      },
      error: (err) => console.error(err)
    });
  }


  cargarCategorias() {
    this.loadingCategories = true;
    this.categoryService.getCategories().subscribe({
      next: (res) => {
        this.categorias = res;
        this.stats.totalCategories = res.length;
        this.loadingCategories = false;
      },
      error: () => { this.loadingCategories = false; }
    });
  }

  cargarUsuarios() {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) return;
    this.loadingUsers = true;
    this.userService.getUsers().subscribe({
      next: (res) => {
        this.usuarios = res;
        for (const u of this.usuarios) {
          if (u.id !== undefined && (u.rol as any)) {
            this.selectedRole[u.id] = (u.rol as any);
          }
        }
        this.stats.totalUsers = res.length;
        this.loadingUsers = false;
      },
      error: () => { this.loadingUsers = false; }
    });
  }

  cambiarTab(tab: TabView) {
    this.activeTab = tab;
    if (tab === 'users' && this.usuarios.length === 0 && !this.loadingUsers) {
      this.cargarUsuarios();
    }
    if (tab === 'categories' && this.categorias.length === 0 && !this.loadingCategories) {
      this.cargarCategorias();
    }
    // Load metrics when switching to metrics tabs
    if (['dashboard', 'revenue', 'subscriptions', 'marketplace', 'commissions'].includes(tab)) {
      if (!this.overview) {
        this.loadOverview();
      }
    }
  }

  /**
   * Set date preset and reload metrics
   */
  setDatePreset(preset: DatePreset) {
    this.selectedDatePreset = preset;

    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    let startDate: Date | undefined;

    switch (preset) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '7days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '30days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '90days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 90);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'all':
      default:
        this.dateRange = undefined;
        this.loadOverview();
        return;
    }

    this.dateRange = { startDate, endDate };
    this.loadOverview();
  }



  crearCategoria() {
    if (this.formCategory.invalid) return;
    const nombreCategoria = this.formCategory.value.name;
    this.categoryService.cargarCategoria(nombreCategoria).subscribe({
      next: (res: any) => {
        this.categorias.push(res);
        this.stats.totalCategories++;
        this.formCategory.reset();
      },
      error: (err) => console.error(err)
    });
  }

  eliminarCategoria(id: number) {
    if (confirm('¿Eliminar categoría?')) {
      this.categoryService.deleteCategory(id).subscribe(() => {
        this.categorias = this.categorias.filter(c => c.id !== id);
        this.stats.totalCategories--;
      });
    }
  }

  eliminarUsuario(id: any) {
    if (confirm('¿Eliminar usuario? Esta acción es irreversible.')) {
      this.userService.delete(id).subscribe(() => {
        this.usuarios = this.usuarios.filter(u => u.id !== id);
        this.stats.totalUsers--;
      });
    }
  }

  cambiarRolConfirm(u: Usuario) {
    if (!this.currentUser || this.currentUser.rol !== 'admin') {
      this.toast.error('No tienes permisos para cambiar roles', 'Permisos insuficientes');
      return;
    }
    if (!u.id) return;
    const nuevoRol = this.selectedRole[u.id];
    const rolActual = (u.rol as any);
    if (!nuevoRol) {
      this.toast.warning('Selecciona un rol válido');
      return;
    }
    if (rolActual === nuevoRol) {
      this.toast.info('El nuevo rol es igual al actual');
      return;
    }
    this.updatingRole[u.id!] = true;
    this.userService.updateRole(u.id!, nuevoRol).subscribe({
      next: (resp: any) => {
        (u.rol as any) = nuevoRol;
        this.toast.success('Rol actualizado correctamente');
        this.updatingRole[u.id!] = false;
      },
      error: () => {
        this.updatingRole[u.id!] = false;
      }
    });
  }

  toggleMobileNav() {
    this.isMobileNavOpen = !this.isMobileNavOpen;
  }

  trackUser(_i: number, u: Usuario) { return u.id; }
  trackCategory(_i: number, c: Categoria) { return c.id; }
}

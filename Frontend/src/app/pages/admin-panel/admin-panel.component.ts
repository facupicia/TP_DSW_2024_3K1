import { Component, inject, OnInit, ChangeDetectionStrategy, DestroyRef, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../services/category.service';
import { CommonModule } from '@angular/common';
import { Categoria } from '../../interfaces/categoria';
import { AuthService, PaginatedUsersResponse } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Usuario } from '../../interfaces/Usuario';
import { AdminService, OverviewResponse, DateRange } from '../../services/admin.service';
import { DashboardOverviewComponent } from '../../components/dashboard-overview/dashboard-overview.component';
import { RevenueViewComponent } from '../../components/revenue-view/revenue-view.component';
import { SubscriptionChartComponent } from '../../components/subscription-chart/subscription-chart.component';
import { CurrencyFormatterPipe, PercentFormatterPipe } from '../../pipes/formatter.pipes';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';

type TabView = 'dashboard' | 'revenue' | 'subscriptions' | 'marketplace' | 'commissions' | 'users' | 'categories';
type DatePreset = 'today' | '7days' | '30days' | '90days' | '180days' | 'all';

@Component({
    selector: 'app-admin-panel',
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
    styleUrls: ['./admin-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminPanelComponent implements OnInit {

  private userService = inject(AuthService);
  private categoryService = inject(CategoryService);
  private adminService = inject(AdminService);
  public formBuild = inject(FormBuilder);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  private overviewLoading = false; // Prevents concurrent duplicate requests

  public activeTab: TabView = 'dashboard';
  public isMobileNavOpen = false;
  public loadingCategories = false;
  public loadingUsers = false;
  public loadingMetrics = false;
  public updatingRole: Record<number, boolean> = {};
  public selectedRoles: Record<number, string[]> = {};  // Support multiple roles
  public availableRoles: Array<'user' | 'admin' | 'scanner' | 'organizer' | 'rrpp'> = ['user', 'admin', 'scanner', 'organizer', 'rrpp'];
  public currentUser: any = null;
  public hasLoadedUsers = false;
  public hasLoadedCategories = false;

  public userPage = 1;
  public userLimit = 20;
  public userTotal = 0;
  public userTotalPages = 1;
  public userSearchInput = '';
  public userSearch = '';
  public userRoleFilter = '';
  public userActiveFilter: 'all' | 'active' | 'inactive' = 'all';
  public userQueryMessage = 'Buscá por email, nombre o ID para administrar roles sin cargar toda la base.';
  public readonly userPageSizeOptions = [10, 20, 50];

  // Date Range Filter
  public selectedDatePreset: DatePreset = 'all';
  public datePresets: { value: DatePreset; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: '7days', label: '7 días' },
    { value: '30days', label: '30 días' },
    { value: '90days', label: '90 días' },
    { value: '180days', label: '6 meses' },
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
  refreshKey = 0;

  ngOnInit(): void {
    // take(1) ensures we only react to the first user emission and don't
    // re-trigger loadOverview if currentUser$ emits again (e.g. on refresh).
    this.userService.currentUser$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe(u => {
      this.currentUser = u;
      if (u && !this.overview && !this.loadingMetrics && !this.overviewLoading) {
        this.loadOverview();
      }
    });
  }

  /**
   * Load comprehensive overview metrics
   */
  loadOverview() {
    if (typeof window === 'undefined') return;
    if (this.overviewLoading) return; // Prevent duplicate concurrent requests

    this.overviewLoading = true;
    this.loadingMetrics = true;
    this.cdr.markForCheck();

    this.adminService.getOverview(this.dateRange).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (response.success) {
          this.overview = response.data;
          // Update legacy stats for backward compatibility
          this.stats.totalUsers = response.data.users.totalUsers;
          this.stats.activeEvents = response.data.events.activeEvents;
        }
        this.loadingMetrics = false;
        this.overviewLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading overview:', err);
        this.toast.error('Error al cargar métricas del panel');
        this.loadingMetrics = false;
        this.overviewLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  cargarCategorias() {
    this.loadingCategories = true;
    this.categoryService.getCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.categorias = res;
        this.stats.totalCategories = res.length;
        this.hasLoadedCategories = true;
        this.loadingCategories = false;
      },
      error: () => { this.loadingCategories = false; }
    });
  }

  cargarUsuarios(resetPage = false) {
    if (typeof window === 'undefined') return;
    if (!this.canSearchUsers) {
      this.usuarios = [];
      this.userTotal = 0;
      this.userTotalPages = 1;
      this.hasLoadedUsers = false;
      this.userQueryMessage = 'Ingresá al menos 2 caracteres, un ID numérico o filtrá por rol.';
      return;
    }
    if (resetPage) {
      this.userPage = 1;
    }

    this.loadingUsers = true;
    this.userService.getUsers({
      page: this.userPage,
      limit: this.userLimit,
      search: this.userSearch,
      role: this.userRoleFilter,
      active: this.userActiveFilter === 'all' ? undefined : this.userActiveFilter === 'active'
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res: PaginatedUsersResponse) => {
        this.usuarios = res.data;
        this.userTotal = res.total;
        this.userPage = res.page;
        this.userLimit = res.limit;
        this.userTotalPages = res.totalPages;
        this.hasLoadedUsers = true;
        this.userQueryMessage = res.message || (res.total === 0 ? 'No se encontraron usuarios para esa búsqueda.' : '');
        for (const u of this.usuarios) {
          if (u.id !== undefined) {
            // Initialize with user's roles (support both old 'rol' and new 'roles')
            const userRoles = (u.roles || [u.rol || 'user']).filter((r): r is string => !!r);
            this.selectedRoles[u.id] = userRoles;
          }
        }
        this.stats.totalUsers = res.total;
        this.loadingUsers = false;
      },
      error: (err) => {
        this.userQueryMessage = typeof err?.error?.message === 'string'
          ? err.error.message
          : 'Error al buscar usuarios';
        this.loadingUsers = false;
      }
    });
  }

  cambiarTab(tab: TabView) {
    this.activeTab = tab;
    this.cdr.markForCheck();
    if (tab === 'categories' && !this.hasLoadedCategories && !this.loadingCategories) {
      this.cargarCategorias();
    }
    // Load metrics when switching to metrics tabs
    if (['dashboard', 'revenue', 'subscriptions', 'marketplace', 'commissions'].includes(tab)) {
      if (!this.overview && !this.overviewLoading) {
        this.loadOverview();
      }
    }
  }

  /**
   * Set date preset and reload metrics
   */
  setDatePreset(preset: DatePreset) {
    this.selectedDatePreset = preset;
    this.cdr.markForCheck();

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
      case '180days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 180);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'all':
      default:
        this.dateRange = undefined;
        this.refreshKey++;
        this.loadOverview();
        return;
    }

    this.dateRange = { startDate, endDate };
    this.refreshKey++;
    this.loadOverview();
  }



  crearCategoria() {
    if (this.formCategory.invalid) return;
    const nombreCategoria = this.formCategory.value.name;
    this.categoryService.cargarCategoria(nombreCategoria).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
      this.categoryService.deleteCategory(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.categorias = this.categorias.filter(c => c.id !== id);
        this.stats.totalCategories--;
      });
    }
  }

  eliminarUsuario(id: any) {
    if (confirm('¿Eliminar usuario? Esta acción es irreversible.')) {
      this.userService.delete(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (this.usuarios.length === 1 && this.userPage > 1) {
          this.userPage--;
        }
        this.cargarUsuarios();
      });
    }
  }

  cambiarRolConfirm(u: Usuario) {
    if (!this.currentUser) {
      this.toast.error('No tienes permisos para cambiar roles', 'Permisos insuficientes');
      return;
    }
    
    // Check admin using roles array
    const currentUserRoles = this.currentUser.roles || [this.currentUser.rol] || [];
    if (!currentUserRoles.includes('admin')) {
      this.toast.error('No tienes permisos para cambiar roles', 'Permisos insuficientes');
      return;
    }
    
    if (!u.id) return;
    const nuevosRoles = this.selectedRoles[u.id];
    const rolesActuales = u.roles || [u.rol] || ['user'];
    
    if (!nuevosRoles || nuevosRoles.length === 0) {
      this.toast.warning('Selecciona al menos un rol');
      return;
    }
    
    // Check if roles are actually different
    const sortedNuevos = [...nuevosRoles].sort();
    const sortedActuales = [...rolesActuales].sort();
    if (JSON.stringify(sortedNuevos) === JSON.stringify(sortedActuales)) {
      this.toast.info('Los roles seleccionados son iguales a los actuales');
      return;
    }
    
    this.updatingRole[u.id!] = true;
    this.userService.updateRole(u.id!, nuevosRoles, 'set').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (resp: any) => {
        u.roles = nuevosRoles;
        u.rol = nuevosRoles.reduce((highest, role) => {
          const levels: Record<string, number> = { user: 1, rrpp: 2, scanner: 3, organizer: 4, admin: 5 };
          return (levels[role] || 0) > (levels[highest] || 0) ? role : highest;
        }, 'user'); // Update legacy field
        this.toast.success('Roles actualizados correctamente');
        this.updatingRole[u.id!] = false;
      },
      error: (err) => {
        this.toast.error('Error al actualizar roles');
        this.updatingRole[u.id!] = false;
      }
    });
  }
  
  // Toggle role selection (add/remove from array)
  toggleRole(userId: number, role: string) {
    const currentRoles = this.selectedRoles[userId] || [];
    if (currentRoles.includes(role)) {
      // Don't remove if it's the only role
      if (currentRoles.length > 1) {
        this.selectedRoles[userId] = currentRoles.filter(r => r !== role);
      }
    } else {
      this.selectedRoles[userId] = [...currentRoles, role];
    }
  }
  
  // Check if user has role selected
  hasRoleSelected(userId: number, role: string): boolean {
    return (this.selectedRoles[userId] || []).includes(role);
  }
  
  // Get display roles for a user
  getUserRolesDisplay(u: Usuario): string {
    const roles = u.roles || [u.rol] || ['user'];
    return roles.join(', ');
  }

  applyUserFilters() {
    this.userSearch = this.userSearchInput.trim();
    if (!this.canSearchUsers) {
      this.usuarios = [];
      this.userTotal = 0;
      this.userTotalPages = 1;
      this.hasLoadedUsers = false;
      this.userQueryMessage = 'Ingresá al menos 2 caracteres, un ID numérico o filtrá por rol.';
      return;
    }
    this.cargarUsuarios(true);
  }

  clearUserFilters() {
    this.userSearchInput = '';
    this.userSearch = '';
    this.userRoleFilter = '';
    this.userActiveFilter = 'all';
    this.usuarios = [];
    this.userTotal = 0;
    this.userPage = 1;
    this.userTotalPages = 1;
    this.hasLoadedUsers = false;
    this.userQueryMessage = 'Buscá por email, nombre o ID para administrar roles sin cargar toda la base.';
  }

  changeUserPage(page: number) {
    if (page < 1 || page > this.userTotalPages || page === this.userPage || this.loadingUsers) {
      return;
    }
    this.userPage = page;
    this.cargarUsuarios();
  }

  onUserPageSizeChange(limit: number) {
    this.userLimit = limit;
    if (this.canSearchUsers) {
      this.cargarUsuarios(true);
    }
  }

  get canSearchUsers(): boolean {
    const search = this.userSearchInput.trim() || this.userSearch.trim();
    return /^\d+$/.test(search) || search.length >= 2 || Boolean(this.userRoleFilter);
  }

  get userRangeStart(): number {
    if (this.userTotal === 0) return 0;
    return (this.userPage - 1) * this.userLimit + 1;
  }

  get userRangeEnd(): number {
    return Math.min(this.userPage * this.userLimit, this.userTotal);
  }

  toggleMobileNav() {
    this.isMobileNavOpen = !this.isMobileNavOpen;
  }

  trackUser(_i: number, u: Usuario) { return u.id; }
  trackCategory(_i: number, c: Categoria) { return c.id; }
}

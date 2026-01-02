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

type TabView = 'dashboard' | 'users' | 'categories';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css']
})
export class AdminPanelComponent implements OnInit {

  private userService = inject(AuthService);
  private categoryService = inject(CategoryService);
  public formBuild = inject(FormBuilder);
  private toast = inject(ToastService);
  private statsService = inject(StatsService);

  public activeTab: TabView = 'dashboard';
  public isMobileNavOpen = false;
  public loadingCategories = false;
  public loadingUsers = false;
  public updatingRole: Record<number, boolean> = {};
  public selectedRole: Record<number, 'user' | 'admin' | 'scanner'> = {};
  public roles: Array<'user' | 'admin' | 'scanner'> = ['user', 'admin', 'scanner'];
  public currentUser: any = null;

  public formCategory: FormGroup = this.formBuild.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
  });

  categorias: Categoria[] = [];
  usuarios: Usuario[] = [];

  stats = {
    totalUsers: 0,
    totalCategories: 0,
    activeEvents: 0
  };

  ngOnInit(): void {
    this.cargarCategorias();
    this.userService.currentUser$.subscribe(u => {
      this.currentUser = u;
    });
    this.loadPlatformStats();
  }

  loadPlatformStats() {
    this.statsService.getPlatformStats().subscribe({
      next: (data) => {
        this.stats.totalUsers = data.totalUsers;
        this.stats.activeEvents = data.totalEvents;
        // this.stats.averageParticipation = data.averageParticipation;
      },
      error: (err) => console.error('Error loading platform stats', err)
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

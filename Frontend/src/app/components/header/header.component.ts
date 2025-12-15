import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnDestroy {
  private router = inject(Router)
  private accesService = inject(AuthService);
  user: any;
  evento: any;
  imgPerfil: string | null = null;



  ngOnInit(): void {
    this.accesService.currentUser$.subscribe(user => {
      this.user = user;
      this.imgPerfil = user?.imgPerfil;
    });
    this.router.events.subscribe(e => {
      if ((e as any).constructor.name === 'NavigationEnd' && this.isMenuOpen) {
        this.isMenuOpen = false;
        this.manageScrollLock();
      }
    });
  }



  redirectToLogin(): void {
    this.router.navigate(['/login']);
  }

  redirectToRegister(): void {
    this.router.navigate(['/register']);
  }

  redirectToExplore(): void {
    this.router.navigate(['/events']);
  }
  goExplore(): void {
    this.router.navigate(['/events']);
  }

  isLoggedIn = typeof localStorage !== 'undefined' && localStorage.getItem('token') !== null;
  showTooltip = false;
  isMenuOpen = false;
  @ViewChild('firstMobileLink') firstMobileLink?: ElementRef<HTMLAnchorElement>;

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    this.manageScrollLock();
    if (this.isMenuOpen) {
      setTimeout(() => {
        this.firstMobileLink?.nativeElement?.focus();
      }, 0);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(_e: KeyboardEvent) {
    if (this.isMenuOpen) {
      this.isMenuOpen = false;
      this.manageScrollLock();
    }
  }

  private manageScrollLock() {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = this.isMenuOpen ? 'hidden' : '';
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }


  crearEvento(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        this.router.navigate(['/create-event']);
      } else {
        this.router.navigate(['/tickets']);
      }
    }
  }

  redirectToProfile() {
    this.router.navigate(['/profile']);
  }


  redirectToLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('cachedProfile');
    }
    this.accesService.logout(); // Limpiar estado reactivo
    this.router.navigate(['/']);
  }
}

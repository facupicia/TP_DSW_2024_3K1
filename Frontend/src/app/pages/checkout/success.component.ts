import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-checkout-success',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './success.component.html'
})
export class CheckoutSuccessComponent implements OnInit {
    constructor(
        private profileService: AuthService,
        private router: Router,
    ) { }
    userProfile: any = {};
    ngOnInit(): void {
        this.profileService.currentUser$.subscribe(user => {
            this.userProfile = user || {};
        });
        if (typeof window !== 'undefined' && !this.userProfile?.id && localStorage.getItem('token')) {
            this.profileService.getProfile().subscribe();
        }
    }
    verTickets() {
        // Si tienes el ID en userProfile, úsalo. Si no, ajusta la ruta.
        if (this.userProfile.id) {
            this.router.navigate([`/my-tickets/${this.userProfile.id}`]);
        } else {
            this.router.navigate(['/events']);
        }
    }
}


import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-checkout-success',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './success.component.html'
})
export class CheckoutSuccessComponent {
    constructor(
        private profileService: AuthService,
        private router: Router,
    ) { }
    userProfile: any = {};
    verTickets() {
        // Si tienes el ID en userProfile, úsalo. Si no, ajusta la ruta.
        if (this.userProfile.id) {
            this.router.navigate([`/my-tickets/${this.userProfile.id}`]);
        }
    }
}


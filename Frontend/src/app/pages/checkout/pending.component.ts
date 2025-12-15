import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-checkout-pending',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './pending.component.html'
})
export class CheckoutPendingComponent { }


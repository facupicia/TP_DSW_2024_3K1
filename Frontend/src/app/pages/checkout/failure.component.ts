import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-checkout-failure',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './failure.component.html'
})
export class CheckoutFailureComponent { }


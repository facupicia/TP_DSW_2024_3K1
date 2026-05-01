import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
    selector: 'app-privacy',
    imports: [HeaderComponent, RouterLink],
    templateUrl: './privacy.component.html',
    styleUrl: './privacy.component.css'
})
export class PrivacyComponent {

}

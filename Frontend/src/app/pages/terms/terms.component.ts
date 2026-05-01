import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
    selector: 'app-terms',
    imports: [HeaderComponent, RouterLink],
    templateUrl: './terms.component.html',
    styleUrl: './terms.component.css'
})
export class TermsComponent {

}

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../components/footer/footer.component';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [HeaderComponent, FooterComponent, RouterLink],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.css'
})
export class TermsComponent {

}

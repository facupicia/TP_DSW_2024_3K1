import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../components/footer/footer.component';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [HeaderComponent, FooterComponent, RouterLink],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.css'
})
export class PrivacyComponent {

}

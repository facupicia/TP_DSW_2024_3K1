import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-crear-event',
  standalone: true,
  imports: [],
  templateUrl: './crear-event.component.html',
  styleUrl: './crear-event.component.css'
})
export class CrearEventComponent {

  constructor(
    private router: Router,
    private authService: AuthService
  ) { }

  
  crearEvento():void{
    this.authService.ensureCurrentUser().subscribe(user => {
      if (user) {
        this.router.navigate(['/create-event']);
      } else {
        this.router.navigate(['/login'], { queryParams: { returnUrl: '/create-event' } });
      }
    });
  }

}

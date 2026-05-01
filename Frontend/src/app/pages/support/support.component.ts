import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../components/footer/footer.component';
import { HeaderComponent } from '../../components/header/header.component';

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FooterComponent, RouterLink],
  templateUrl: './support.component.html',
  styleUrl: './support.component.css'
})
export class SupportComponent {
  faqs: FaqItem[] = [
    {
      question: 'Cómo compro una entrada?',
      answer: 'Ingresá al evento, elegí el tipo de entrada disponible y confirmá el pago. Cuando la operación se aprueba, la entrada queda asociada a tu cuenta.'
    },
    {
      question: 'Dónde veo mis entradas?',
      answer: 'Iniciá sesión y entrá a tu perfil para acceder a tus tickets. Desde ahí podés ver los detalles y el código QR de acceso.'
    },
    {
      question: 'Qué hago si mi pago quedó pendiente?',
      answer: 'Algunos pagos pueden demorar en acreditarse. Esperá la confirmación de Mercado Pago y revisá nuevamente tus entradas. Si el estado no cambia, contactá al organizador o al soporte de la plataforma.'
    },
    {
      question: 'Cómo creo un evento?',
      answer: 'Con tu cuenta iniciada, usá la opción Crear Evento. Vas a poder cargar datos del evento, imagen, categoría, ubicación y tipos de entrada.'
    },
    {
      question: 'Cómo conecto Mercado Pago para cobrar?',
      answer: 'Desde Configuración podés conectar tu cuenta de Mercado Pago. Esa conexión permite recibir pagos de las entradas vendidas en tus eventos.'
    },
    {
      question: 'Cómo se valida una entrada en puerta?',
      answer: 'Los usuarios con rol scanner pueden ingresar al escáner, leer el QR del ticket y confirmar si la entrada es válida para el evento.'
    },
    {
      question: 'Puedo cancelar mi plan PRO?',
      answer: 'Si tenés una suscripción activa, podés cancelarla desde Configuración. El plan se mantiene disponible hasta el final del período vigente.'
    },
    {
      question: 'No puedo iniciar sesión con Google, qué hago?',
      answer: 'Verificá que el navegador permita ventanas emergentes o usá el flujo de redirección. En Safari iOS, EventLife usa un modo compatible para evitar bloqueos del navegador.'
    }
  ];
}

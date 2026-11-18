import { TestBed } from '@angular/core/testing';
import { TicketFlipCardComponent } from './ticket-flip-card.component';

describe('Ticket QR accessibility', () => {
  it('exposes a native toggle and hides the inactive face from keyboard and screen readers', async () => {
    await TestBed.configureTestingModule({ imports: [TicketFlipCardComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TicketFlipCardComponent);
    fixture.componentInstance.ticket = { codigo_unico: 'test-ticket', event: { title: 'Test event' } };
    fixture.detectChanges();
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-pressed]');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(fixture.nativeElement.querySelector('.flip-card-back').hasAttribute('inert')).toBeTrue();
    toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.flip-card-front').getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('.flip-card-back').hasAttribute('inert')).toBeFalse();
    fixture.destroy();
  });
});

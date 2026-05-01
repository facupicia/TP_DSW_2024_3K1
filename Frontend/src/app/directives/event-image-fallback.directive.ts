import { Directive, ElementRef, HostListener, inject, Input } from '@angular/core';

export const EVENT_IMAGE_FALLBACK = '/assets/event-placeholder.svg';

@Directive({
  selector: 'img[appEventImageFallback]',
  standalone: true
})
export class EventImageFallbackDirective {
  private readonly elementRef = inject<ElementRef<HTMLImageElement>>(ElementRef);
  private didFallback = false;

  @Input() appEventImageFallback = EVENT_IMAGE_FALLBACK;

  @HostListener('error')
  onImageError(): void {
    if (this.didFallback) {
      return;
    }

    this.didFallback = true;
    const image = this.elementRef.nativeElement;
    image.removeAttribute('srcset');
    image.removeAttribute('ng-img');
    image.src = this.appEventImageFallback || EVENT_IMAGE_FALLBACK;
  }
}

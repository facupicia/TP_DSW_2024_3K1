import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'currency',
    standalone: true
})
export class CurrencyFormatterPipe implements PipeTransform {
    transform(value: number | null | undefined): string {
        if (value === null || value === undefined) return '$0';

        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }
}

@Pipe({
    name: 'percent',
    standalone: true
})
export class PercentFormatterPipe implements PipeTransform {
    transform(value: number | null | undefined): string {
        if (value === null || value === undefined) return '0%';
        return `${value.toFixed(1)}%`;
    }
}

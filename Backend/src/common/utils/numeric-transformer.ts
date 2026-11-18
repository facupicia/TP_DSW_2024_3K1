import type { ValueTransformer } from 'typeorm';

// All mapped decimals have at most 12 digits and scale 2. Their integer cents
// fit safely in a JS number; preserve nullable values instead of coercing to 0.
export const numericTransformer: ValueTransformer = {
    to(value: number | string | null | undefined) {
        if (value === null || value === undefined) return value;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error('Invalid numeric value');
        return numeric;
    },
    from(value: number | string | null | undefined) {
        if (value === null || value === undefined) return value;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error('Invalid stored numeric value');
        return numeric;
    }
};

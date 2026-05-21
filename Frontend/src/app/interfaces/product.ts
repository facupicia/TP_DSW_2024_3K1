export type ProductCategory = 'drink' | 'food' | 'parking' | 'merch' | 'combo' | 'other';

export interface Product {
    id: number;
    name: string;
    description?: string;
    category: ProductCategory;
    basePrice: number;
    imageUrl?: string;
    organizerId: number;
    createdAt: string;
    updatedAt: string;
}

export interface EventProduct {
    id: number;
    eventId: number;
    productId: number;
    product: Product;
    isActive: boolean;
    eventPrice: number;
    hasStock: boolean;
    stock: number;
    soldCount: number;
    maxPerOrder: number;
    createdAt: string;
    updatedAt: string;
}

export interface ExtraItem {
    id: number;
    codigo_unico: string;
    qrCode: string;
    eventProductId: number;
    eventProduct: EventProduct;
    userId: number;
    paymentLogId?: number;
    quantity: number;
    status: 'active' | 'used' | 'cancelled';
    purchasePrice: number;
    usedAt?: string;
    scannedById?: number;
    createdAt: string;
    updatedAt: string;
}

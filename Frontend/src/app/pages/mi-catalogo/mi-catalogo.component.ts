import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductService } from '../../services/product.service';
import { Product, ProductCategory } from '../../interfaces/product';
import { ToastService } from '../../services/toast.service';
import { EventImageFallbackDirective } from '../../directives/event-image-fallback.directive';
import { ImageUploadService } from '../../services/image-upload.service';

@Component({
    selector: 'app-mi-catalogo',
    imports: [CommonModule, HeaderComponent, FormsModule, RouterLink, EventImageFallbackDirective],
    templateUrl: './mi-catalogo.component.html',
    styleUrl: './mi-catalogo.component.css'
})
export class MiCatalogoComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private toastService = inject(ToastService);
    private productService = inject(ProductService);
    private imageUploadService = inject(ImageUploadService);

    products: Product[] = [];
    filteredProducts: Product[] = [];
    loading = true;
    saving = false;
    showForm = false;
    editingProduct: Product | null = null;
    searchTerm = '';
    activeCategory: ProductCategory | 'all' = 'all';

    selectedImageFile: File | null = null;
    imagePreview = '';
    private imagePreviewObjectUrl: string | null = null;

    private readonly allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    private readonly maxImageSize = 8 * 1024 * 1024;

    newProduct: Partial<Product> = {
        name: '',
        description: '',
        category: 'other',
        basePrice: 0,
        imageUrl: ''
    };

    categories = [
        { value: 'all' as const, label: 'Todos', icon: 'grid' },
        { value: 'drink' as ProductCategory, label: 'Bebida', icon: 'cup' },
        { value: 'food' as ProductCategory, label: 'Comida', icon: 'utensils' },
        { value: 'parking' as ProductCategory, label: 'Estacionamiento', icon: 'car' },
        { value: 'merch' as ProductCategory, label: 'Merch', icon: 'shirt' },
        { value: 'combo' as ProductCategory, label: 'Combo', icon: 'package' },
        { value: 'other' as ProductCategory, label: 'Otro', icon: 'dots' }
    ];

    categoryColors: Record<string, string> = {
        drink: 'bg-blue-500/90',
        food: 'bg-orange-500/90',
        parking: 'bg-slate-600/90',
        merch: 'bg-pink-500/90',
        combo: 'bg-purple-500/90',
        other: 'bg-gray-500/90'
    };

    ngOnInit(): void {
        this.loadCatalog();
    }

    ngOnDestroy(): void {
        this.revokeImagePreview();
    }

    loadCatalog() {
        this.loading = true;
        this.productService.getMyCatalog().subscribe({
            next: (products) => {
                this.products = products;
                this.filteredProducts = products;
                this.loading = false;
            },
            error: () => {
                this.toastService.error('Error al cargar el catálogo');
                this.loading = false;
            }
        });
    }

    filterProducts() {
        let result = this.products;
        if (this.activeCategory !== 'all') {
            result = result.filter(p => p.category === this.activeCategory);
        }
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            result = result.filter(p =>
                p.name.toLowerCase().includes(term) ||
                (p.description?.toLowerCase().includes(term) ?? false)
            );
        }
        this.filteredProducts = result;
    }

    setCategory(cat: ProductCategory | 'all') {
        this.activeCategory = cat;
        this.filterProducts();
    }

    onImageSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (!this.allowedImageTypes.has(file.type)) {
            this.toastService.warning('Usá una imagen JPG, PNG, WebP o GIF');
            input.value = '';
            return;
        }
        if (file.size > this.maxImageSize) {
            this.toastService.warning('La imagen no puede superar 8MB');
            input.value = '';
            return;
        }

        this.selectedImageFile = file;
        this.revokeImagePreview();
        this.imagePreviewObjectUrl = URL.createObjectURL(file);
        this.imagePreview = this.imagePreviewObjectUrl;
    }

    clearSelectedImage(): void {
        this.selectedImageFile = null;
        this.revokeImagePreview();
        this.imagePreview = this.editingProduct?.imageUrl || '';
    }

    getImagePreview(): string {
        return this.imagePreview || this.newProduct.imageUrl || '';
    }

    private revokeImagePreview(): void {
        if (this.imagePreviewObjectUrl) {
            URL.revokeObjectURL(this.imagePreviewObjectUrl);
            this.imagePreviewObjectUrl = null;
        }
    }

    openCreate() {
        this.editingProduct = null;
        this.newProduct = { name: '', description: '', category: 'other', basePrice: 0, imageUrl: '' };
        this.selectedImageFile = null;
        this.imagePreview = '';
        this.revokeImagePreview();
        this.showForm = true;
    }

    openEdit(product: Product) {
        this.editingProduct = product;
        this.newProduct = { ...product };
        this.selectedImageFile = null;
        this.imagePreview = product.imageUrl || '';
        this.revokeImagePreview();
        this.showForm = true;
    }

    closeForm() {
        this.showForm = false;
        this.editingProduct = null;
        this.selectedImageFile = null;
        this.imagePreview = '';
        this.revokeImagePreview();
    }

    saveProduct() {
        if (!this.newProduct.name || this.newProduct.basePrice == null) {
            this.toastService.error('Nombre y precio son obligatorios');
            return;
        }

        this.saving = true;

        if (this.selectedImageFile) {
            this.imageUploadService.uploadImage(this.selectedImageFile, 'product').subscribe({
                next: ({ url }) => this.persistProduct(url),
                error: () => {
                    this.toastService.error('No se pudo subir la imagen');
                    this.saving = false;
                }
            });
            return;
        }

        this.persistProduct(this.newProduct.imageUrl || '');
    }

    private persistProduct(imageUrl: string) {
        const payload = { ...this.newProduct, imageUrl };

        if (this.editingProduct) {
            this.productService.updateProduct(this.editingProduct.id, payload).subscribe({
                next: () => {
                    this.toastService.success('Producto actualizado');
                    this.saving = false;
                    this.closeForm();
                    this.loadCatalog();
                },
                error: (err) => {
                    this.saving = false;
                    this.toastService.error(err.error?.message || 'Error al actualizar');
                }
            });
        } else {
            this.productService.createProduct(payload).subscribe({
                next: () => {
                    this.toastService.success('Producto creado');
                    this.saving = false;
                    this.closeForm();
                    this.loadCatalog();
                },
                error: (err) => {
                    this.saving = false;
                    if (err.error?.code === 'PLAN_LIMIT_CATALOG') {
                        this.toastService.error('Tu plan no permite más productos. Actualiza a PRO.');
                    } else {
                        this.toastService.error(err.error?.message || 'Error al crear producto');
                    }
                }
            });
        }
    }

    deleteProduct(id: number) {
        if (!confirm('¿Seguro que querés eliminar este producto?')) return;
        this.productService.deleteProduct(id).subscribe({
            next: () => {
                this.toastService.success('Producto eliminado');
                this.loadCatalog();
            },
            error: () => this.toastService.error('Error al eliminar')
        });
    }

    categoryLabel(cat: ProductCategory): string {
        return this.categories.find(c => c.value === cat)?.label || cat;
    }

    getCategoryColor(cat: string): string {
        return this.categoryColors[cat] || 'bg-gray-500/90';
    }
}

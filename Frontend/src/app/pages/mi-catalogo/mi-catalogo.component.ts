import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductService } from '../../services/product.service';
import { Product, ProductCategory } from '../../interfaces/product';
import { ToastService } from '../../services/toast.service';

@Component({
    selector: 'app-mi-catalogo',
    imports: [CommonModule, HeaderComponent, FormsModule],
    templateUrl: './mi-catalogo.component.html',
    styleUrl: './mi-catalogo.component.css'
})
export class MiCatalogoComponent implements OnInit {
    private router = inject(Router);
    private toastService = inject(ToastService);
    private productService = inject(ProductService);

    products: Product[] = [];
    loading = true;
    showForm = false;
    editingProduct: Product | null = null;

    newProduct: Partial<Product> = {
        name: '',
        description: '',
        category: 'other',
        basePrice: 0,
        imageUrl: ''
    };

    categories = [
        { value: 'drink', label: 'Bebida' },
        { value: 'food', label: 'Comida' },
        { value: 'parking', label: 'Estacionamiento' },
        { value: 'merch', label: 'Merch' },
        { value: 'combo', label: 'Combo' },
        { value: 'other', label: 'Otro' }
    ];

    ngOnInit(): void {
        this.loadCatalog();
    }

    loadCatalog() {
        this.loading = true;
        this.productService.getMyCatalog().subscribe({
            next: (products) => {
                this.products = products;
                this.loading = false;
            },
            error: () => {
                this.toastService.error('Error al cargar el catálogo');
                this.loading = false;
            }
        });
    }

    openCreate() {
        this.editingProduct = null;
        this.newProduct = { name: '', description: '', category: 'other', basePrice: 0, imageUrl: '' };
        this.showForm = true;
    }

    openEdit(product: Product) {
        this.editingProduct = product;
        this.newProduct = { ...product };
        this.showForm = true;
    }

    closeForm() {
        this.showForm = false;
        this.editingProduct = null;
    }

    saveProduct() {
        if (!this.newProduct.name || this.newProduct.basePrice == null) {
            this.toastService.error('Nombre y precio son obligatorios');
            return;
        }

        if (this.editingProduct) {
            this.productService.updateProduct(this.editingProduct.id, this.newProduct).subscribe({
                next: () => {
                    this.toastService.success('Producto actualizado');
                    this.closeForm();
                    this.loadCatalog();
                },
                error: (err) => {
                    this.toastService.error(err.error?.message || 'Error al actualizar');
                }
            });
        } else {
            this.productService.createProduct(this.newProduct).subscribe({
                next: () => {
                    this.toastService.success('Producto creado');
                    this.closeForm();
                    this.loadCatalog();
                },
                error: (err) => {
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
}

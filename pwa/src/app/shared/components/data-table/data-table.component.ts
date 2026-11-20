import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppIconComponent } from '../app-icon/app-icon.component';
import {
  DataTableColumn,
  DataTablePaginationEvent,
  DataTableSortEvent,
} from './data-table.models';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  templateUrl: './data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent<T = any> {
  // Inputs principales de datos y columnas
  readonly data = input<T[]>([]);
  readonly columns = input<DataTableColumn<T>[]>([]);

  // Opciones de paginación estrictas: [5, 10, 15, 50, 100]
  readonly pageSizeOptions = input<number[]>([5, 10, 15, 50, 100]);
  readonly pageSize = model<number>(10);
  readonly page = model<number>(1);

  // Estados visuales y de configuración
  readonly searchable = input<boolean>(true);
  readonly searchPlaceholder = input<string>('Buscar en los registros...');
  readonly loading = input<boolean>(false);
  readonly emptyMessage = input<string>('No se encontraron registros.');
  readonly tableTitle = input<string | null>(null);

  // Soporte Servidor vs Cliente
  readonly serverSide = input<boolean>(false);
  readonly totalItems = input<number | undefined>(undefined);

  // Plantilla personalizada opcional para renderizar filas completas
  readonly rowTemplate = input<TemplateRef<{ $implicit: T; index: number }> | null>(null);

  // Eventos de salida
  readonly pageChange = output<DataTablePaginationEvent>();
  readonly sortChange = output<DataTableSortEvent>();
  readonly rowClick = output<T>();
  readonly searchChange = output<string>();

  // Señales de filtrado y ordenamiento local
  readonly searchQuery = signal<string>('');
  readonly sortKey = signal<string | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  // Filtrado reactivo (Modo Cliente)
  readonly filteredData = computed<T[]>(() => {
    const list = this.data();
    const query = this.searchQuery().trim().toLowerCase();

    if (this.serverSide() || !query) {
      return list;
    }

    return list.filter((item: any) => {
      if (!item || typeof item !== 'object') return false;
      return Object.values(item).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(query);
      });
    });
  });

  // Ordenamiento reactivo (Modo Cliente)
  readonly sortedData = computed<T[]>(() => {
    const list = [...this.filteredData()];
    const key = this.sortKey();
    const direction = this.sortDirection();

    if (this.serverSide() || !key) {
      return list;
    }

    return list.sort((a: any, b: any) => {
      const valA = a[key];
      const valB = b[key];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
      }

      return direction === 'asc' ? comparison : -comparison;
    });
  });

  // Total de registros
  readonly totalRecords = computed<number>(() => {
    if (this.serverSide()) {
      return this.totalItems() ?? this.data().length;
    }
    return this.sortedData().length;
  });

  // Total de páginas calculadas
  readonly totalPages = computed<number>(() => {
    const total = this.totalRecords();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  // Datos paginados finales a mostrar en la vista
  readonly displayData = computed<T[]>(() => {
    if (this.serverSide()) {
      return this.data();
    }
    const start = (this.page() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.sortedData().slice(start, end);
  });

  // Rango de elementos mostrados: "Mostrando X a Y de Z registros"
  readonly itemRange = computed<{ start: number; end: number; total: number }>(() => {
    const total = this.totalRecords();
    if (total === 0) {
      return { start: 0, end: 0, total: 0 };
    }
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.page() * this.pageSize(), total);
    return { start, end, total };
  });

  // Generador inteligente de páginas visibles con elipsis (...)
  readonly visiblePages = computed<Array<number | string>>(() => {
    const current = this.page();
    const total = this.totalPages();

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: Array<number | string> = [];
    pages.push(1);

    if (current > 3) {
      pages.push('...');
    }

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 2) {
      pages.push('...');
    }

    pages.push(total);
    return pages;
  });

  // Métodos de interacción y navegación
  onSearchInput(val: string): void {
    this.searchQuery.set(val);
    this.page.set(1);
    this.searchChange.emit(val);
    this.emitPageChange();
  }

  clearSearch(): void {
    this.onSearchInput('');
  }

  toggleSort(col: DataTableColumn<T>): void {
    if (col.sortable === false) return;

    if (this.sortKey() === col.key) {
      this.sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(col.key);
      this.sortDirection.set('asc');
    }

    this.sortChange.emit({
      key: col.key,
      direction: this.sortDirection(),
    });
  }

  onPageSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newSize = Number(select.value);
    if (!isNaN(newSize) && newSize > 0) {
      this.pageSize.set(newSize);
      this.page.set(1);
      this.emitPageChange();
    }
  }

  goToPage(p: number | string): void {
    if (typeof p !== 'number') return;
    if (p >= 1 && p <= this.totalPages() && p !== this.page()) {
      this.page.set(p);
      this.emitPageChange();
    }
  }

  firstPage(): void {
    this.goToPage(1);
  }

  previousPage(): void {
    if (this.page() > 1) {
      this.goToPage(this.page() - 1);
    }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.goToPage(this.page() + 1);
    }
  }

  lastPage(): void {
    this.goToPage(this.totalPages());
  }

  onRowClick(item: T): void {
    this.rowClick.emit(item);
  }

  getCellValue(item: any, col: DataTableColumn<T>): any {
    if (!item) return '';
    const rawVal = item[col.key];
    if (col.formatter) {
      return col.formatter(rawVal, item);
    }
    return rawVal !== null && rawVal !== undefined ? rawVal : '—';
  }

  trackByFn(item: any, index: number): any {
    return item?.id || index;
  }

  private emitPageChange(): void {
    this.pageChange.emit({
      page: this.page(),
      pageSize: this.pageSize(),
    });
  }
}

export interface DataTableColumn<T = any> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  cellClass?: string;
  headerClass?: string;
  formatter?: (value: any, item: T) => string;
}

export interface DataTablePaginationEvent {
  page: number;
  pageSize: number;
}

export interface DataTableSortEvent {
  key: string;
  direction: 'asc' | 'desc';
}

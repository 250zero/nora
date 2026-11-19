import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NORA_ICON_CATALOG, NoraIconName } from '../../../core/icons/icon-catalog';

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    <span
      class="inline-flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full"
      [class]="customClass()"
      [innerHTML]="svgContent()"
    ></span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppIconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<NoraIconName>();
  readonly customClass = input<string>('w-5 h-5');

  readonly svgContent = computed<SafeHtml>(() => {
    const iconName = this.name();
    const rawSvg = NORA_ICON_CATALOG[iconName] || '';
    return this.sanitizer.bypassSecurityTrustHtml(rawSvg);
  });
}

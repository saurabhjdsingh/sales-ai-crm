import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  forwardRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true
    }
  ],
  template: `
    <div class="rich-editor-wrapper">
      <!-- Rich Formatting Toolbar -->
      <div class="editor-toolbar">
        <button
          type="button"
          class="toolbar-btn"
          (click)="exec('bold')"
          matTooltip="Bold (Ctrl+B)"
          title="Bold"
        >
          <mat-icon>format_bold</mat-icon>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          (click)="exec('italic')"
          matTooltip="Italic (Ctrl+I)"
          title="Italic"
        >
          <mat-icon>format_italic</mat-icon>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          (click)="exec('underline')"
          matTooltip="Underline (Ctrl+U)"
          title="Underline"
        >
          <mat-icon>format_underlined</mat-icon>
        </button>
        
        <div class="toolbar-divider"></div>

        <button
          type="button"
          class="toolbar-btn"
          (click)="exec('insertUnorderedList')"
          matTooltip="Bullet List"
          title="Bullet List"
        >
          <mat-icon>format_list_bulleted</mat-icon>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          (click)="exec('insertOrderedList')"
          matTooltip="Numbered List"
          title="Numbered List"
        >
          <mat-icon>format_list_numbered</mat-icon>
        </button>

        <div class="toolbar-divider"></div>

        <button
          type="button"
          class="toolbar-btn"
          (click)="createLink()"
          matTooltip="Insert Link"
          title="Insert Link"
        >
          <mat-icon>link</mat-icon>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          (click)="exec('removeFormat')"
          matTooltip="Clear Formatting"
          title="Clear Formatting"
        >
          <mat-icon>format_clear</mat-icon>
        </button>
      </div>

      <!-- Contenteditable Editor Container -->
      <div
        #editorBody
        contenteditable="true"
        class="editor-body"
        [style.minHeight]="minHeight"
        (input)="onContentInput()"
        (blur)="onContentInput()"
        [attr.data-placeholder]="placeholder"
      ></div>
    </div>
  `,
  styles: [`
    .rich-editor-wrapper {
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: #0f172a;
      overflow: hidden;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .rich-editor-wrapper:focus-within {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .editor-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 6px 10px;
      background: rgba(15, 23, 42, 0.8);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      flex-wrap: wrap;
    }

    .toolbar-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      border-radius: 4px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #f8fafc;
      }

      &:active {
        background: rgba(59, 130, 246, 0.25);
        color: #60a5fa;
      }
    }

    .toolbar-divider {
      width: 1px;
      height: 18px;
      background: rgba(255, 255, 255, 0.12);
      margin: 0 4px;
    }

    .editor-body {
      padding: 12px 14px;
      color: #f8fafc;
      font-size: 14px;
      line-height: 1.6;
      outline: none;
      overflow-y: auto;
      max-height: 400px;
      word-break: break-word;

      &:empty:before {
        content: attr(data-placeholder);
        color: #64748b;
        pointer-events: none;
        display: block;
      }

      ul, ol {
        padding-left: 24px;
        margin: 8px 0;
      }

      p {
        margin: 0 0 8px 0;
      }

      a {
        color: #60a5fa;
        text-decoration: underline;
      }
    }

    :host-context(body.light-theme) {
      .rich-editor-wrapper {
        background: #ffffff;
        border-color: #cbd5e1;
      }

      .rich-editor-wrapper:focus-within {
        border-color: #2563eb;
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
      }

      .editor-toolbar {
        background: #f8fafc;
        border-bottom-color: #e2e8f0;
      }

      .toolbar-btn {
        color: #475569;

        &:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
      }

      .toolbar-divider {
        background: #cbd5e1;
      }

      .editor-body {
        color: #0f172a;

        &:empty:before {
          color: #94a3b8;
        }

        a {
          color: #2563eb;
        }
      }
    }
  `]
})
export class RichTextEditorComponent implements OnChanges, ControlValueAccessor {
  @Input() htmlValue: string = '';
  @Input() placeholder: string = 'Type your email message...';
  @Input() minHeight: string = '180px';

  @Output() htmlValueChange = new EventEmitter<string>();
  @Output() textValueChange = new EventEmitter<string>();

  @ViewChild('editorBody', { static: true }) editorBody!: ElementRef<HTMLDivElement>;

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};
  private isDisabled: boolean = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['htmlValue'] && this.editorBody) {
      const currentElementHtml = this.editorBody.nativeElement.innerHTML;
      if (this.htmlValue !== currentElementHtml) {
        this.editorBody.nativeElement.innerHTML = this.htmlValue || '';
      }
    }
  }

  exec(command: string, value: string | undefined = undefined): void {
    document.execCommand(command, false, value);
    this.onContentInput();
  }

  createLink(): void {
    const url = prompt('Enter URL link:');
    if (url) {
      const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      this.exec('createLink', formattedUrl);
    }
  }

  onContentInput(): void {
    if (!this.editorBody) return;
    const html = this.editorBody.nativeElement.innerHTML;
    const text = this.editorBody.nativeElement.innerText || '';

    this.htmlValue = html;
    this.htmlValueChange.emit(html);
    this.textValueChange.emit(text);
    this.onChange(html);
    this.onTouched();
  }

  // ControlValueAccessor implementation
  writeValue(val: string): void {
    this.htmlValue = val || '';
    if (this.editorBody) {
      this.editorBody.nativeElement.innerHTML = this.htmlValue;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    if (this.editorBody) {
      this.editorBody.nativeElement.contentEditable = (!isDisabled).toString();
    }
  }
}

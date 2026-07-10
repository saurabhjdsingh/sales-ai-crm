import { Injectable, inject, signal, computed } from '@angular/core';
import { ContactService } from './contact.service';
import { Contact } from '../../../core/models/crm.model';
import { finalize, tap } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';

@Injectable({
  providedIn: 'root'
})
export class ContactStore {
  private readonly contactService = inject(ContactService);
  private readonly notification = inject(NotificationService);

  // State
  private readonly _contacts = signal<Contact[]>([]);
  private readonly _selectedContact = signal<Contact | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _totalCount = signal<number>(0);
  private readonly _page = signal<number>(1);
  private readonly _filters = signal<Record<string, any>>({});

  // Selectors
  readonly contacts = computed(() => this._contacts());
  readonly selectedContact = computed(() => this._selectedContact());
  readonly loading = computed(() => this._loading());
  readonly totalCount = computed(() => this._totalCount());
  readonly page = computed(() => this._page());
  readonly filters = computed(() => this._filters());

  loadContacts(page = 1, filters = this._filters()): void {
    this._loading.set(true);
    this._page.set(page);
    this._filters.set(filters);

    this.contactService.getContacts({ page, ...filters }).pipe(
      tap((res) => {
        this._contacts.set(res.results);
        this._totalCount.set(res.count);
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to load contacts')
    });
  }

  loadContact(id: string): void {
    this._loading.set(true);
    this._selectedContact.set(null);

    this.contactService.getContact(id).pipe(
      tap((contact) => this._selectedContact.set(contact)),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to load contact details')
    });
  }

  createContact(contact: Partial<Contact>, callback?: () => void): void {
    this._loading.set(true);
    this.contactService.createContact(contact).pipe(
      tap((newContact) => {
        this._contacts.update((list) => [newContact, ...list]);
        this.notification.success('Contact created successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to create contact';
        this.notification.error(msg);
      }
    });
  }

  updateContact(id: string, updates: Partial<Contact>, callback?: () => void): void {
    this._loading.set(true);
    this.contactService.updateContact(id, updates).pipe(
      tap((updated) => {
        this._contacts.update((list) => list.map((c) => (c.id === id ? updated : c)));
        if (this._selectedContact()?.id === id) {
          this._selectedContact.set(updated);
        }
        this.notification.success('Contact updated successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to update contact';
        this.notification.error(msg);
      }
    });
  }

  deleteContact(id: string, callback?: () => void): void {
    this._loading.set(true);
    this.contactService.deleteContact(id).pipe(
      tap(() => {
        this._contacts.update((list) => list.filter((c) => c.id !== id));
        if (this._selectedContact()?.id === id) {
          this._selectedContact.set(null);
        }
        this.notification.success('Contact deleted successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete contact')
    });
  }

  bulkDeleteContacts(ids: string[], callback?: () => void): void {
    this._loading.set(true);
    this.contactService.bulkDeleteContacts(ids).pipe(
      tap(() => {
        this._contacts.update((list) => list.filter((c) => !ids.includes(c.id)));
        if (this._selectedContact() && ids.includes(this._selectedContact()!.id)) {
          this._selectedContact.set(null);
        }
        this.notification.success('Selected contacts deleted successfully');
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete selected contacts')
    });
  }
}

import { useLayoutEffect, useRef } from 'react';
import { Flame, X } from 'lucide-react';

interface FirebaseConfigModalProps {
  open: boolean;
  onClose: () => void;
  cloudConfigured: boolean;
}

export function FirebaseConfigModal({ open, onClose, cloudConfigured }: FirebaseConfigModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Firebase competition setup"
      aria-modal="true"
      className="setup-dialog card p-5 sm:p-6 backdrop:bg-night/55"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        // This informational dialog has a single interactive control.
        if (event.key === 'Tab') {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-display text-title font-bold tracking-tight text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-guard-soft text-guard">
            <Flame className="h-4 w-4" />
          </span>
          Firebase AI Logic · Competition copy
        </h3>
        <button
          ref={closeRef}
          autoFocus
          aria-label="Close Firebase setup"
          type="button"
          onClick={onClose}
          className="btn btn-icon text-ink-3 hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-4 text-body text-ink-2">
        {cloudConfigured
          ? 'A fixed Firebase Web App is configured. Each text request still requires its own verified App Check token.'
          : 'Cloud is locked. You can still view and edit the itinerary locally.'}
      </p>
      <p className="mt-3 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2.5 text-meta text-ink-3">
        The project, App Check provider and cloud model are fixed by the reviewed build. Trip storage, private notes and photos stay local.
      </p>
    </dialog>
  );
}

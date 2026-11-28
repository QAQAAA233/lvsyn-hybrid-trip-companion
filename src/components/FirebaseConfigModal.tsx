import { useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface FirebaseConfigModalProps {
  open: boolean;
  onClose: () => void;
  cloudConfigured: boolean;
}

export function FirebaseConfigModal({open, onClose, cloudConfigured}: FirebaseConfigModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={dialogRef} aria-label="Firebase competition setup" aria-modal="true"
      className="setup-dialog rounded-2xl border border-stone-200 bg-white p-5 shadow-xl backdrop:bg-stone-900/50"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        // This informational dialog has a single interactive control.
        if (event.key === 'Tab') {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-stone-900">Firebase AI Logic · Competition copy</h3>
          <button ref={closeRef} autoFocus aria-label="Close Firebase setup" type="button" onClick={onClose}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-2 text-sm text-stone-700">{cloudConfigured
          ? 'A fixed Firebase Web App is configured. Each text request still requires its own verified App Check token.'
          : 'Cloud is locked. You can still view and edit the itinerary locally.'}</p>
        <p className="mt-2 text-xs text-stone-500">The project, App Check provider and cloud model are fixed by the reviewed build. Trip storage, private notes and photos stay local.</p>
    </dialog>
  );
}

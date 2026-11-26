import { X } from 'lucide-react';

interface FirebaseConfigModalProps {
  open: boolean;
  onClose: () => void;
  cloudConfigured: boolean;
}

export function FirebaseConfigModal({open, onClose, cloudConfigured}: FirebaseConfigModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <section aria-label="Firebase competition setup" role="dialog" aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-stone-900">Firebase AI Logic · Competition copy</h3>
          <button autoFocus aria-label="Close Firebase setup" type="button" onClick={onClose}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-2 text-sm text-stone-700">{cloudConfigured
          ? 'A fixed Firebase Web App is configured. Each text request still requires its own verified App Check token.'
          : 'Cloud fallback is locked. You can still use this demo locally.'}</p>
        <p className="mt-2 text-xs text-stone-500">The project, App Check provider and fallback model are fixed by the reviewed build. Trip storage, private notes and photos stay local.</p>
      </section>
    </div>
  );
}

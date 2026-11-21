import { useState } from 'react';
import { X } from 'lucide-react';
import {
  getRuntimeFirebaseConfig,
  saveStoredFirebaseOverride,
  type StoredFirebaseOverride,
} from '../firebase/config';

interface FirebaseConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function FirebaseConfigModal({ open, onClose, onSaved }: FirebaseConfigModalProps) {
  const current = getRuntimeFirebaseConfig();
  const [form, setForm] = useState<StoredFirebaseOverride>({
    apiKey: current.isLiveProject ? current.config.apiKey : '',
    authDomain: current.isLiveProject ? current.config.authDomain : '',
    projectId: current.isLiveProject ? current.config.projectId : '',
    appId: current.isLiveProject ? current.config.appId : '',
    appCheckDebugToken: current.appCheckDebugToken,
    recaptchaSiteKey: current.recaptchaSiteKey,
    cloudModel: current.cloudModel,
    emulatorBaseUrl: current.emulatorBaseUrl,
  });

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredFirebaseOverride(form);
    await onSaved();
    onClose();
  };

  const handleClear = async () => {
    saveStoredFirebaseOverride(null);
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-stone-900">
              Firebase AI Logic &amp; App Check Runtime Setup
            </h3>
            <p className="text-xs text-stone-500">
              Connect any free Spark-plan Firebase Web App or local cloud emulator without rebuilding.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-3 text-xs">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="font-semibold text-stone-700">Firebase API Key</span>
              <input
                type="text"
                value={form.apiKey || ''}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="Paste Spark Web apiKey"
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-stone-700">Project ID</span>
              <input
                type="text"
                value={form.projectId || ''}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                placeholder="your-firebase-project"
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-stone-700">App ID</span>
              <input
                type="text"
                value={form.appId || ''}
                onChange={(e) => setForm({ ...form, appId: e.target.value })}
                placeholder="1:...:web:..."
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-stone-700">Cloud Fallback Model</span>
              <input
                type="text"
                value={form.cloudModel || 'gemini-3.5-flash-lite'}
                onChange={(e) => setForm({ ...form, cloudModel: e.target.value })}
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-stone-700">App Check Debug Token</span>
              <input
                type="text"
                value={form.appCheckDebugToken || ''}
                onChange={(e) => setForm({ ...form, appCheckDebugToken: e.target.value })}
                placeholder="true or UUID debug token"
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-stone-700">reCAPTCHA v3 Site Key</span>
              <input
                type="text"
                value={form.recaptchaSiteKey || ''}
                onChange={(e) => setForm({ ...form, recaptchaSiteKey: e.target.value })}
                placeholder="Optional for production"
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="font-semibold text-stone-700">
              Local Cloud Emulator Base URL (Dev Only)
            </span>
            <input
              type="text"
              value={form.emulatorBaseUrl || ''}
              onChange={(e) => setForm({ ...form, emulatorBaseUrl: e.target.value })}
              placeholder="e.g. http://127.0.0.1:8788 (blank = real Firebase AI Logic endpoint)"
              className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5"
            />
          </label>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-stone-300 px-3 py-1.5 font-semibold text-stone-600 hover:bg-stone-50"
            >
              Reset to Env Defaults
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-300 px-3 py-1.5 font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 font-semibold text-white hover:bg-emerald-700"
              >
                Save &amp; Reinitialize SDK
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

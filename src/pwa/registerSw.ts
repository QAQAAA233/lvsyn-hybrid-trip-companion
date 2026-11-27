export function registerOfflineServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env?.PROD) return;

  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL || './'}sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => {
      // Service worker registration is best-effort
    });
  });
}

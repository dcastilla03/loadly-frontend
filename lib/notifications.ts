// ============================================
// TASF.B2B - Notificaciones Toast
// ============================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationOptions {
  type?: ToastType;
  duration?: number;
}

export function showNotification(
  message: string,
  typeOrOptions?: ToastType | NotificationOptions,
  duration: number = 4000
): void {
  let type: ToastType = 'info';
  let actualDuration = duration;

  if (typeof typeOrOptions === 'string') {
    type = typeOrOptions;
  } else if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
    type = typeOrOptions.type || 'info';
    actualDuration = typeOrOptions.duration || duration;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, actualDuration);
}

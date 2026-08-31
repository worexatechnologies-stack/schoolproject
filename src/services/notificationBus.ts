export type NotificationTone = 'info' | 'success' | 'warning' | 'danger';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  tone: NotificationTone;
  timestamp: string;
  read: boolean;
  source?: string;
}

export const NOTIFICATION_EVENT = 'volpehub:notification';

export function emitNotification(input: {
  title: string;
  message: string;
  tone?: NotificationTone;
  source?: string;
}) {
  const notification: AppNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    message: input.message,
    tone: input.tone || 'info',
    timestamp: new Date().toISOString(),
    read: false,
    source: input.source,
  };

  window.dispatchEvent(new CustomEvent<AppNotification>(NOTIFICATION_EVENT, { detail: notification }));
  return notification;
}


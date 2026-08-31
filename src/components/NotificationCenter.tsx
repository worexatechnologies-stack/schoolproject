import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Volume2, X } from 'lucide-react';
import { AppNotification, emitNotification, NOTIFICATION_EVENT } from '../services/notificationBus';
import { enablePushNotifications, isFirebaseMessagingConfigured } from '../services/firebaseMessaging';

const STORAGE_KEY = 'erp_live_notifications';
const SOUND_KEY = 'erp_notification_sound_enabled';

interface NotificationCenterProps {
  logs?: string[];
  isGlass?: boolean;
  is3D?: boolean;
}

function loadNotifications(): AppNotification[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function playNotificationSound() {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);
  setTimeout(() => context.close(), 450);
}

export default function NotificationCenter({ logs = [], isGlass = false, is3D = false }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>(loadNotifications);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) !== 'false');
  const toastTimer = useRef<number | null>(null);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 60)));
  }, [notifications]);

  useEffect(() => {
    const onNotification = (event: Event) => {
      const item = (event as CustomEvent<AppNotification>).detail;
      if (!item) return;

      setNotifications((prev) => [item, ...prev].slice(0, 60));
      setToast(item);

      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 5200);

      if (soundEnabled) {
        try {
          playNotificationSound();
        } catch {
          // Browser may block audio until the user interacts with the page.
        }
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(item.title, {
          body: item.message,
          tag: item.id,
          silent: !soundEnabled,
        });
      }
    };

    window.addEventListener(NOTIFICATION_EVENT, onNotification);
    return () => window.removeEventListener(NOTIFICATION_EVENT, onNotification);
  }, [soundEnabled]);

  useEffect(() => {
    const lastSeenLogs = sessionStorage.getItem('erp_last_log_count');
    const previousCount = lastSeenLogs ? Number(lastSeenLogs) : logs.length;
    if (logs.length > previousCount && logs[0]) {
      emitNotification({
        title: 'System activity',
        message: logs[0],
        tone: 'info',
        source: 'logs',
      });
    }
    sessionStorage.setItem('erp_last_log_count', String(logs.length));
  }, [logs]);

  const requestPermission = async () => {
    setSoundEnabled(true);
    localStorage.setItem(SOUND_KEY, 'true');
    try {
      playNotificationSound();
    } catch {
      // ignored
    }
    const result = await enablePushNotifications();
    if (result.registered) {
      emitNotification({ title: 'Push notifications enabled', message: 'This browser will receive school notifications even in the background.', tone: 'success', source: 'fcm' });
    } else if (result.permission === 'denied') {
      emitNotification({ title: 'Push notifications blocked', message: 'Allow notifications in your browser settings to receive school alerts.', tone: 'warning', source: 'fcm' });
    } else if (result.permission === 'not-configured') {
      emitNotification({ title: 'Push setup pending', message: 'Firebase web configuration has not been added for this environment yet.', tone: 'info', source: 'fcm' });
    }
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
    setToast(null);
  };

  const buttonClass = `w-8 h-8 rounded-full transition-all flex items-center justify-center relative border cursor-pointer ${
    isGlass
      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
      : is3D
        ? 'bg-white border-slate-200 text-slate-600 hover:text-indigo-600 shadow-[2px_2px_5px_rgba(163,177,198,0.15)] hover:translate-y-[-1px] active:translate-y-[1px]'
        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 hover:shadow-xs'
  }`;

  return (
    <div className="relative">
      <button onClick={() => setIsOpen((value) => !value)} className={buttonClass} title="Notifications">
        <Bell className="w-3.5 h-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-black text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-popover absolute right-0 top-11 z-50 w-[360px] overflow-hidden rounded-2xl">
          <div className="notification-popover__header flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-extrabold">Live notifications</p>
              <p className="text-[11px] text-slate-400">Your personal activity inbox</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="notification-popover__actions flex gap-2 p-3">
            <button onClick={() => void requestPermission()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-indigo-400" title={isFirebaseMessagingConfigured() ? 'Enable browser push notifications' : 'Firebase configuration is required before push can be enabled'}>
              <Volume2 className="h-3.5 w-3.5" />
              Enable push
            </button>
            <button onClick={markAllRead} className="rounded-xl bg-white/10 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-white/15">
              <CheckCheck className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="notification-popover__body max-h-96 overflow-y-auto p-3 pt-0">
            {notifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-400">
                No notifications yet. New timetable, fees, attendance and system activity will appear here.
              </div>
            ) : notifications.map((item) => (
              <div key={item.id} className={`notification-popover__item mb-2 rounded-xl p-3 ${item.read ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold">{item.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{item.message}</p>
                  </div>
                  {!item.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                </div>
                <time className="mt-2 block text-[9px] font-mono text-slate-500">
                  {new Date(item.timestamp).toLocaleString()}
                </time>
              </div>
            ))}
          </div>

          {notifications.length > 0 && (
            <button onClick={clearAll} className="notification-popover__clear w-full px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/5">
              Clear all notifications
            </button>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed right-5 top-24 z-[80] w-[330px] animate-fade-in rounded-2xl border border-indigo-100 bg-white p-4 text-slate-900 shadow-2xl shadow-indigo-500/20">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold">{toast.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

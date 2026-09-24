import { WorkoutActivityType } from '@kingstinct/react-native-healthkit';
import type { SourceKind } from '@ultra-health/core';

const SOURCE_LABELS: Record<SourceKind, string> = {
  apple_watch: 'Apple Watch',
  iphone: 'iPhone',
  whoop: 'Whoop',
  smart_scale: 'Smart scale',
  manual: 'Manual entry',
  third_party_app: 'Other app',
};

export const sourceLabel = (kind: SourceKind) => SOURCE_LABELS[kind];

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatRelative(ms: number, now = Date.now()): string {
  const seconds = Math.round((now - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(ms);
}

/** `traditionalStrengthTraining` → `Traditional strength training`. */
export function workoutName(activityType: number): string {
  const raw = (WorkoutActivityType as unknown as Record<number, string | undefined>)[activityType];
  if (!raw) return 'Workout';
  const words = raw.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

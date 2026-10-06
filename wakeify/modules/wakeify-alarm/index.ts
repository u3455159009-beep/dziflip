import { requireOptionalNativeModule } from 'expo';

import type { WakeifyAlarmEvents, WakeifyAlarmNativeModule } from './src/WakeifyAlarm.types';

export * from './src/WakeifyAlarm.types';

type Subscription = { remove(): void };

type NativeWithEvents = WakeifyAlarmNativeModule & {
  addListener<E extends keyof WakeifyAlarmEvents>(event: E, listener: WakeifyAlarmEvents[E]): Subscription;
};

/**
 * The native engine, or null when running in an environment without the
 * compiled module (Expo Go, web, unit tests). Callers must handle null and
 * tell the user that a development/production build is required — we never
 * pretend an alarm was scheduled when it was not.
 */
export const WakeifyAlarm: NativeWithEvents | null =
  requireOptionalNativeModule<NativeWithEvents>('WakeifyAlarm');

export function isNativeAlarmEngineAvailable(): boolean {
  return WakeifyAlarm != null;
}

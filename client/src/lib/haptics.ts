/**
 * haptics — Web Vibration API wrapper for mobile haptic feedback.
 *
 * Betting/prediction apps should "buzz" on key moments:
 *   - Prediction reveal
 *   - Win/loss result
 *   - Button taps (subtle)
 *   - Error states
 *
 * Gracefully no-ops on devices without vibration support (desktop, iOS Safari
 * — Apple doesn't support the API but we check anyway).
 *
 * Usage:
 *   import { haptics } from '@/lib/haptics';
 *   haptics.light();     // 10ms — button tap
 *   haptics.medium();    // 20ms — selection
 *   haptics.heavy();     // 50ms — error, strong feedback
 *   haptics.success();   // pattern — win, prediction confirmed
 *   haptics.warning();   // pattern — caution
 *   haptics.error();     // pattern — loss, critical error
 *   haptics.reveal();    // pattern — prediction card reveal (signature moment)
 */

type VibratePattern = number | number[];

function vibrate(pattern: VibratePattern) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Silently fail — haptics are nice-to-have, not critical
  }
}

export const haptics = {
  /** 10ms — subtle tap, for button presses */
  light: () => vibrate(10),

  /** 20ms — selection, toggle, tab switch */
  medium: () => vibrate(20),

  /** 50ms — strong feedback, for errors or important confirmations */
  heavy: () => vibrate(50),

  /** Pattern: short-strong-short — success, win, prediction confirmed */
  success: () => vibrate([10, 30, 20]),

  /** Pattern: double-tap — caution, warning */
  warning: () => vibrate([20, 40, 20]),

  /** Pattern: long buzz — error, loss */
  error: () => vibrate([60, 30, 60]),

  /** Pattern: rising — signature moment, prediction reveal */
  reveal: () => vibrate([5, 15, 10, 25, 15, 40]),
};

export default haptics;

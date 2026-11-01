import { describe, expect, it, vi } from 'vitest';
import { runViewTransition } from './viewTransitions.js';

describe('runViewTransition', () => {
  it('uses the native browser API when available', () => {
    const update = vi.fn();
    const transition = { finished: Promise.resolve() };
    const startViewTransition = vi.fn((callback) => {
      callback();
      return transition;
    });
    const documentRef = { startViewTransition };

    expect(runViewTransition(update, documentRef)).toBe(transition);
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('runs the update normally when the API is unavailable', () => {
    const update = vi.fn();
    expect(runViewTransition(update, {})).toBeUndefined();
    expect(update).toHaveBeenCalledOnce();
  });

  it('falls back to a normal update if the API throws synchronously', () => {
    const update = vi.fn();
    const documentRef = { startViewTransition: vi.fn(() => { throw new Error('unsupported'); }) };

    expect(runViewTransition(update, documentRef)).toBeUndefined();
    expect(update).toHaveBeenCalledOnce();
  });

  it('ignores a non-function update safely', () => {
    expect(runViewTransition(null, {})).toBeUndefined();
  });
});

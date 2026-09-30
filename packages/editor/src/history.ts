"use client";
import { useCallback, useRef, useState } from "react";

const LIMIT = 100;
const COALESCE_MS = 800;

/**
 * Undo/redo editor (DECISIONS #77).
 * - `commit(next, tag?)`: satu langkah undo; perubahan beruntun dengan `tag` sama dalam 0,8 dtk digabung (mengetik).
 * - `preview(next)` lalu `end()`: geser/resize/putar; hanya keadaan sebelum drag yang masuk riwayat.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const base = useRef<T | null>(null);
  const last = useRef<{ tag: string; at: number } | null>(null);

  const commit = useCallback((next: T | ((p: T) => T), tag?: string) => {
    // Diputuskan di luar updater: updater harus murni (StrictMode memanggilnya dua kali).
    const now = Date.now();
    const merge = !!tag && last.current?.tag === tag && now - last.current.at < COALESCE_MS;
    last.current = tag ? { tag, at: now } : null;
    setState((s) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(s.present) : next;
      return {
        past: merge ? s.past : [...s.past, s.present].slice(-LIMIT),
        present: value,
        future: [],
      };
    });
  }, []);

  const preview = useCallback((next: T | ((p: T) => T)) => {
    setState((s) => {
      if (base.current === null) base.current = s.present;
      const value = typeof next === "function" ? (next as (p: T) => T)(s.present) : next;
      return { ...s, present: value };
    });
  }, []);

  const end = useCallback(() => {
    const b = base.current;
    base.current = null;
    last.current = null;
    if (b === null) return;
    setState((s) =>
      s.present === b ? s : { past: [...s.past, b].slice(-LIMIT), present: s.present, future: [] },
    );
  }, []);

  const undo = useCallback(() => {
    last.current = null;
    setState((s) => {
      const prev = s.past.at(-1);
      return prev === undefined
        ? s
        : { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setState((s) => {
      const [next, ...rest] = s.future;
      return next === undefined ? s : { past: [...s.past, s.present], present: next, future: rest };
    });
  }, []);

  return {
    value: state.present,
    commit,
    preview,
    end,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

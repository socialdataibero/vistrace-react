import { useSyncExternalStore, useRef } from "react";

type SetState<T> = {
  (partial: Partial<T> | ((state: T) => Partial<T>)): void;
};
type GetState<T> = () => T;
type StoreApi<T> = {
  getState: GetState<T>;
  setState: SetState<T>;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T extends object>(
  initializer: (set: SetState<T>, get: GetState<T>) => T
): StoreApi<T> {
  let state: T;
  const listeners = new Set<() => void>();

  const getState: GetState<T> = () => state;

  const setState: SetState<T> = (partial) => {
    const nextPartial =
      typeof partial === "function"
        ? (partial as (s: T) => Partial<T>)(state)
        : partial;
    const nextState = Object.assign({}, state, nextPartial);
    if (!Object.is(state, nextState)) {
      state = nextState;
      listeners.forEach((l) => l());
    }
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  state = initializer(setState, getState);

  return { getState, setState, subscribe };
}

/** Two selections that hold the same items, so a selector that builds a new array does not re-render. */
export function sameSelection(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
}

export function useStore<T extends object, S>(
  store: StoreApi<T>,
  selector: (state: T) => S
): S {
  const last = useRef<{ value: S } | null>(null);

  // Runs the selector of this render: one kept from an earlier render would close over old values
  // (a node would not see the input it was just connected to).
  const getSnapshot = () => {
    const next = selector(store.getState());
    if (!last.current || !sameSelection(last.current.value, next)) last.current = { value: next };
    return last.current.value;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

const DEFAULT_STATE = {
  phase: 'idle',
  step: null,
  steps: {},
  coverage: 0,
  complete: false,
  aiStatus: 'idle',
};

let state = { ...DEFAULT_STATE };
const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    try { listener(state); } catch (error) { /* never break subscribers */ }
  }
}

export const hireVerificationStore = {
  get: () => ({ ...state, steps: { ...state.steps } }),
  set: (patch) => {
    state = { ...state, ...patch };
    emit();
  },
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset: () => {
    state = { ...DEFAULT_STATE };
    emit();
  },
};
/**
 * State - Singleton state management utility for components.
 *
 * Provides a type-safe way to create component-level singleton state
 * with lazy initialization support.
 *
 * ## Design Philosophy
 *
 * - **Singleton by default**: Each State instance is a singleton
 * - **Lazy initialization**: State is initialized on first access
 * - **Type-safe**: Full TypeScript support for state shape
 * - **Immutable updates**: Set takes a function to prevent stale closures
 *
 * ## Usage
 *
 * ### Basic State
 *
 * ```typescript
 * namespace MyComponent {
 *   type MyState = {
 *     items: string[];
 *     count: number;
 *   };
 *
 *   const state = State.create<MyState>({
 *     init: () => ({
 *       items: [],
 *       count: 0,
 *     }),
 *   });
 *
 *   export const addItem = (item: string) => {
 *     state.set((prev) => ({
 *       ...prev,
 *       items: [...prev.items, item],
 *       count: prev.count + 1,
 *     }));
 *   };
 *
 *   export const getItems = () => state.get().items;
 * }
 * ```
 *
 * ### Async Initialization
 *
 * ```typescript
 * namespace DbComponent {
 *   const state = State.create<DbState>({
 *     init: async () => {
 *       const connection = await createDbConnection();
 *       return { connection, isConnected: true };
 *     },
 *   });
 *
 *   // First call will await initialization
 *   export const query = async (sql: string) => {
 *     const { connection } = await state.getAsync();
 *     return connection.query(sql);
 *   };
 * }
 * ```
 *
 * ### With App Context
 *
 * ```typescript
 * namespace RunManager {
 *   const state = State.create<RunManagerState>({
 *     init: async () => {
 *       // Access app context during init
 *       return await App.use(async (ctx) => ({
 *         eventBus: ctx.eventBus,
 *         runs: new Map(),
 *       }));
 *     },
 *   });
 * }
 * ```
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Synchronous initializer function.
 */
type SyncInit<T> = () => T;

/**
 * Asynchronous initializer function.
 */
type AsyncInit<T> = () => Promise<T>;

/**
 * State configuration options.
 */
export interface StateConfig<T> {
  /**
   * Initializer function for the state.
   * Can be sync or async.
   */
  init: SyncInit<T> | AsyncInit<T>;
}

/**
 * State updater function.
 * Receives previous state, returns new state.
 */
type StateUpdater<T> = (prev: T) => T;

/**
 * A State instance for managing singleton state.
 */
export interface State<T> {
  /**
   * Get the current state.
   * If state has async initializer and isn't initialized yet, returns default empty state.
   * For proper initialization with async init, use getAsync() first.
   *
   * @returns The current state or default empty state
   */
  get(): T;

  /**
   * Get the current state, awaiting initialization if needed.
   * Use this when you need to ensure async initialization is complete.
   *
   * @returns Promise resolving to the current state
   */
  getAsync(): Promise<T>;

  /**
   * Update the state using an updater function.
   * Works synchronously if state is initialized or has sync init.
   * For async init, call getAsync() first to ensure initialization.
   *
   * @param updater - Function that receives previous state and returns new state
   */
  set(updater: StateUpdater<T>): void;

  /**
   * Check if state has been initialized.
   *
   * @returns True if state is initialized
   */
  isInitialized(): boolean;

  /**
   * Reset the state to uninitialized.
   * Next get/getAsync will re-run the initializer.
   *
   * Useful for testing.
   */
  reset(): void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a new State instance.
 *
 * @param config - State configuration with initializer
 * @returns A State instance
 *
 * @example
 * ```typescript
 * // Sync initialization
 * const counterState = State.create<{ count: number }>({
 *   init: () => ({ count: 0 }),
 * });
 *
 * // Async initialization
 * const dbState = State.create<{ conn: Connection }>({
 *   init: async () => ({ conn: await connect() }),
 * });
 * ```
 */
function create<T>(config: StateConfig<T>): State<T> {
  let state: T | undefined = undefined;
  let initialized = false;
  let initPromise: Promise<T> | null = null;

  /**
   * Try to initialize synchronously.
   * Only works if init is sync and hasn't been called yet.
   */
  const tryInitSync = (): boolean => {
    if (initialized) {
      return true;
    }

    if (initPromise) {
      // Async init already in progress
      return false;
    }

    try {
      const result = config.init();

      // Check if it's a promise (async init)
      if (result instanceof Promise) {
        // Start async init but don't block
        initPromise = result.then((r) => {
          state = r;
          initialized = true;
          initPromise = null;
          return r;
        });
        return false;
      }

      // Sync init succeeded
      state = result;
      initialized = true;
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Initialize state if not already initialized.
   * Handles both sync and async initializers.
   */
  const ensureInitialized = async (): Promise<T> => {
    if (initialized && state !== undefined) {
      return state;
    }

    // Try sync first
    if (tryInitSync() && state !== undefined) {
      return state;
    }

    // If async init is in progress, wait for it
    if (initPromise) {
      return initPromise;
    }

    // This shouldn't happen, but fallback just in case
    throw new Error('Failed to initialize state');
  };

  return {
    get(): T {
      // Try to init synchronously
      tryInitSync();

      // Return state if initialized, otherwise return empty object as default
      // This allows reading from state even if async init is still in progress
      return state ?? ({} as T);
    },

    async getAsync(): Promise<T> {
      return ensureInitialized();
    },

    set(updater: StateUpdater<T>): void {
      // Try sync init first
      tryInitSync();

      // If state is still undefined, initialize with empty object first
      if (state === undefined) {
        state = {} as T;
        initialized = true;
      }

      state = updater(state);
    },

    isInitialized(): boolean {
      return initialized;
    },

    reset(): void {
      state = undefined;
      initialized = false;
      initPromise = null;
    },
  };
}

// ============================================================================
// Namespace Export
// ============================================================================

/**
 * State namespace for creating singleton state instances.
 *
 * @example
 * ```typescript
 * import { State } from "@/utils/state";
 *
 * const myState = State.create<MyStateType>({
 *   init: () => ({ ... }),
 * });
 * ```
 */
export const State = {
  create,
} as const;

export default State;

// ============================================================================
// State V2 - Type-safe sync/async based on init function
// ============================================================================

/**
 * State V2 - Improved state management where API matches init function type.
 *
 * If init is sync, get/set are sync.
 * If init is async, get/set are async.
 *
 * ## Usage
 *
 * ### Sync State
 * ```typescript
 * const state = StateV2.create({
 *   init: () => ({ count: 0 }),
 * });
 *
 * state.get(); // Returns T directly
 * state.set(prev => ({ ...prev, count: prev.count + 1 })); // Sync
 * ```
 *
 * ### Async State
 * ```typescript
 * const state = StateV2.create({
 *   init: async () => {
 *     const conn = await connect();
 *     return { conn };
 *   },
 * });
 *
 * await state.get(); // Returns Promise<T>
 * await state.set(prev => ({ ...prev })); // Async
 * ```
 */

// ============================================================================
// V2 Types
// ============================================================================

/**
 * Sync state config - init returns T directly.
 */
export interface SyncStateConfig<T> {
  init: () => T;
}

/**
 * Async state config - init returns Promise<T>.
 */
export interface AsyncStateConfig<T> {
  init: () => Promise<T>;
}

/**
 * Sync State instance - all operations are synchronous.
 */
export interface SyncState<T> {
  /**
   * Get the current state synchronously.
   */
  get(): T;

  /**
   * Update the state synchronously.
   */
  set(updater: StateUpdater<T>): void;

  /**
   * Check if state has been initialized.
   */
  isInitialized(): boolean;

  /**
   * Reset the state to uninitialized.
   */
  reset(): void;
}

/**
 * Async State instance - all operations return Promises.
 */
export interface AsyncState<T> {
  /**
   * Get the current state, awaiting initialization if needed.
   */
  get(): Promise<T>;

  /**
   * Update the state, awaiting initialization if needed.
   */
  set(updater: StateUpdater<T>): Promise<void>;

  /**
   * Check if state has been initialized.
   */
  isInitialized(): boolean;

  /**
   * Reset the state to uninitialized.
   */
  reset(): void;
}

// ============================================================================
// V2 Implementation
// ============================================================================

/**
 * Create a sync state instance.
 */
function createSyncState<T>(config: SyncStateConfig<T>): SyncState<T> {
  let state: T | undefined = undefined;
  let initialized = false;

  const ensureInit = (): T => {
    if (!initialized) {
      state = config.init();
      initialized = true;
    }
    return state as T;
  };

  return {
    get(): T {
      return ensureInit();
    },

    set(updater: StateUpdater<T>): void {
      state = updater(ensureInit());
    },

    isInitialized(): boolean {
      return initialized;
    },

    reset(): void {
      state = undefined;
      initialized = false;
    },
  };
}

/**
 * Create an async state instance.
 */
function createAsyncState<T>(config: AsyncStateConfig<T>): AsyncState<T> {
  let state: T | undefined = undefined;
  let initialized = false;
  let initPromise: Promise<T> | null = null;

  const ensureInit = async (): Promise<T> => {
    if (initialized && state !== undefined) {
      return state;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise = config.init().then((result) => {
      state = result;
      initialized = true;
      initPromise = null;
      return result;
    });

    return initPromise;
  };

  return {
    async get(): Promise<T> {
      return ensureInit();
    },

    async set(updater: StateUpdater<T>): Promise<void> {
      const current = await ensureInit();
      state = updater(current);
    },

    isInitialized(): boolean {
      return initialized;
    },

    reset(): void {
      state = undefined;
      initialized = false;
      initPromise = null;
    },
  };
}

/**
 * Create a State V2 instance.
 *
 * The return type is automatically inferred based on whether init is sync or async.
 *
 * @example
 * ```typescript
 * // Sync - get() returns T
 * const syncState = StateV2.create({ init: () => ({ count: 0 }) });
 * const value = syncState.get(); // T
 *
 * // Async - get() returns Promise<T>
 * const asyncState = StateV2.create({ init: async () => ({ count: 0 }) });
 * const value = await asyncState.get(); // Promise<T>
 * ```
 */
function createV2<T>(config: SyncStateConfig<T>): SyncState<T>;
function createV2<T>(config: AsyncStateConfig<T>): AsyncState<T>;
function createV2<T>(
  config: SyncStateConfig<T> | AsyncStateConfig<T>
): SyncState<T> | AsyncState<T> {
  // Test if init returns a promise by checking the function
  const testResult = config.init();

  if (testResult instanceof Promise) {
    // It's async - but we already called init, so we need to handle this
    // Create async state and seed it with the promise we already started
    let state: T | undefined = undefined;
    let initialized = false;
    let initPromise: Promise<T> | null = testResult.then((result) => {
      state = result;
      initialized = true;
      initPromise = null;
      return result;
    });

    const ensureInit = async (): Promise<T> => {
      if (initialized && state !== undefined) {
        return state;
      }
      if (initPromise) {
        return initPromise;
      }
      // Re-init if reset was called
      initPromise = (config as AsyncStateConfig<T>).init().then((result) => {
        state = result;
        initialized = true;
        initPromise = null;
        return result;
      });
      return initPromise;
    };

    return {
      async get(): Promise<T> {
        return ensureInit();
      },
      async set(updater: StateUpdater<T>): Promise<void> {
        const current = await ensureInit();
        state = updater(current);
      },
      isInitialized(): boolean {
        return initialized;
      },
      reset(): void {
        state = undefined;
        initialized = false;
        initPromise = null;
      },
    } as AsyncState<T>;
  }

  // It's sync - we already have the result
  let state: T = testResult;
  let initialized = true;

  return {
    get(): T {
      if (!initialized) {
        state = (config as SyncStateConfig<T>).init();
        initialized = true;
      }
      return state;
    },
    set(updater: StateUpdater<T>): void {
      if (!initialized) {
        state = (config as SyncStateConfig<T>).init();
        initialized = true;
      }
      state = updater(state);
    },
    isInitialized(): boolean {
      return initialized;
    },
    reset(): void {
      state = undefined as unknown as T;
      initialized = false;
    },
  } as SyncState<T>;
}

/**
 * StateV2 namespace - Type-safe state where API matches init function.
 */
export const StateV2 = {
  create: createV2,
} as const;

/**
 * BloomDOM - VSBloom's DOM Observation Library
 * 
 * A lightweight, efficient library for watching DOM elements.
 * Uses a single global MutationObserver with rAF batching for optimal performance.
 * 
 * @example
 * ```ts
 * import bloomdom from 'bloomdom';
 * 
 * // Watch for elements globally
 * const handle = bloom.watch('.tab', {
 *     onAdded: (tab) => {
 *         gsap.from(tab, { opacity: 0 });
 *         return () => console.log('tab removed'); // optional cleanup
 *     },
 * });
 * 
 * // Watch for elements within a specific ancestor type
 * const handle = bloom.watch('.monaco-mouse-cursor-text', {
 *     within: '.editor-instance',
 *     onAdded: (cursor) => setupCursorTrail(cursor),
 * });
 * 
 * // Stop watching
 * handle.stop();
 * ```
 */

/// <reference lib="dom" />

// ============================================================================
// Types
// ============================================================================

/** Cleanup function returned from onAdded callbacks */
export type CleanupFn = () => void;

/** Configuration for watch() */
export interface WatchConfig {
    /**
     * Called when a matching element is added to the DOM.
     * Can optionally return a cleanup function that runs when the element is removed.
     */
    onAdded?: (element: Element) => CleanupFn | void;
    
    /**
     * Called when a matching element is removed from the DOM.
     * Runs after any cleanup function from onAdded.
     */
    onRemoved?: (element: Element) => void;
    
    /**
     * Only match elements that have an ancestor matching this selector.
     * Uses element.closest() for ancestry check.
     */
    within?: string;
    
    /**
     * Process elements that already exist in the DOM when watch() is called.
     * @default true
     */
    processExisting?: boolean;
}

/** Handle returned from watch() */
export interface WatchHandle {
    /** Stop watching and run all cleanup functions */
    stop(): void;
    /** Whether the watcher is currently active */
    readonly active: boolean;
}

/** Options for waitFor() */
export interface WaitForOptions {
    /** Timeout in milliseconds (0 = no timeout) @default 10000 */
    timeout?: number;
    /** Parent element to search within @default document */
    parent?: Element | Document;
}

// ============================================================================
// Global Observer
// ============================================================================

type Subscriber = (added: Element[], removed: Element[]) => void;

class GlobalObserver {
    private observer: MutationObserver | null = null;
    private subscribers = new Set<Subscriber>();
    private pendingAdded = new Set<Element>();
    private pendingRemoved = new Set<Element>();
    private frameScheduled = false;

    subscribe(callback: Subscriber): () => void {
        this.subscribers.add(callback);
        this.ensureObserving();
        return () => this.unsubscribe(callback);
    }

    private unsubscribe(callback: Subscriber): void {
        this.subscribers.delete(callback);
        if (this.subscribers.size === 0) {
            this.disconnect();
        }
    }

    private ensureObserving(): void {
        if (this.observer) {
            return;
        }

        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) {
                        this.pendingAdded.add(node);
                        this.pendingRemoved.delete(node); // Handle moves
                    }
                }
                for (const node of mutation.removedNodes) {
                    if (node instanceof Element) {
                        this.pendingRemoved.add(node);
                        this.pendingAdded.delete(node); // Handle moves
                    }
                }
            }
            this.scheduleFlush();
        });

        // Observe from the most stable ancestor we can find
        const root = document.querySelector('.monaco-workbench') 
            || document.querySelector('.monaco-shell') 
            || document.body;
        
        this.observer.observe(root, { childList: true, subtree: true });
    }

    private scheduleFlush(): void {
        if (this.frameScheduled) {
            return;
        }
        this.frameScheduled = true;

        requestAnimationFrame(() => {
            this.frameScheduled = false;
            
            if (this.pendingAdded.size === 0 && this.pendingRemoved.size === 0) {
                return;
            }

            const added = [...this.pendingAdded];
            const removed = [...this.pendingRemoved];
            this.pendingAdded.clear();
            this.pendingRemoved.clear();

            for (const subscriber of this.subscribers) {
                try {
                    subscriber(added, removed);
                } catch (e) {
                    console.error('[BloomDOM] Subscriber error:', e);
                }
            }
        });
    }

    private disconnect(): void {
        this.observer?.disconnect();
        this.observer = null;
        this.pendingAdded.clear();
        this.pendingRemoved.clear();
        this.frameScheduled = false;
    }
}

const globalObserver = new GlobalObserver();

// ============================================================================
// Core API
// ============================================================================

/**
 * Watch for elements matching a selector to be added or removed from the DOM.
 * 
 * @param selector - CSS selector for elements to watch
 * @param config - Watch configuration
 * @returns Handle to stop watching
 */
export function watch(selector: string, config: WatchConfig = {}): WatchHandle {
    const {
        onAdded,
        onRemoved,
        within,
        processExisting = true,
    } = config;

    // Validate selectors
    try {
        document.querySelector(selector);
        if (within) {
            document.querySelector(within);
        }
    } catch (e) {
        throw new Error(`[BloomDOM] Invalid selector: ${e}`);
    }

    // State
    // Using Set instead of WeakSet so we can iterate on stop() to run all cleanups
    const processed = new Set<Element>();
    const cleanups = new Map<Element, CleanupFn>();
    let active = true;

    /**
     * Check if an element matches our criteria
     */
    const matches = (el: Element): boolean => {
        if (!el.matches(selector)) {
            return false;
        }
        if (within && !el.closest(within)) {
            return false;
        }
        return true;
    };

    /**
     * Process an added element
     */
    const handleAdded = (el: Element): void => {
        if (processed.has(el)) {
            return;
        }
        processed.add(el);

        if (onAdded) {
            try {
                const cleanup = onAdded(el);
                if (cleanup) {
                    cleanups.set(el, cleanup);
                }
            } catch (e) {
                console.error('[BloomDOM] onAdded error:', e);
            }
        }
    };

    /**
     * Process a removed element
     */
    const handleRemoved = (el: Element): void => {
        // Run cleanup if registered
        const cleanup = cleanups.get(el);
        if (cleanup) {
            try {
                cleanup();
            } catch (e) {
                console.error('[BloomDOM] cleanup error:', e);
            }
            cleanups.delete(el);
        }

        // Remove from processed set to allow re-processing if element is re-added
        // and to prevent memory leaks from holding element references
        processed.delete(el);

        // Call onRemoved callback
        if (onRemoved) {
            try {
                onRemoved(el);
            } catch (e) {
                console.error('[BloomDOM] onRemoved error:', e);
            }
        }
    };

    /**
     * Process a mutation batch
     */
    const handleMutations = (added: Element[], removed: Element[]): void => {
        if (!active) {
            return;
        }

        // Process additions: check element and descendants
        for (const el of added) {
            if (matches(el)) {
                handleAdded(el);
            }
            // Check descendants
            const descendants = el.querySelectorAll(selector);
            for (const desc of descendants) {
                if (matches(desc)) {
                    handleAdded(desc);
                }
            }
        }

        // Process removals: check element and descendants
        for (const el of removed) {
            if (el.matches(selector) && processed.has(el)) {
                handleRemoved(el);
            }
            // Check descendants
            const descendants = el.querySelectorAll(selector);
            for (const desc of descendants) {
                if (processed.has(desc)) {
                    handleRemoved(desc);
                }
            }
        }
    };

    // Process existing elements
    if (processExisting) {
        const existing = document.querySelectorAll(selector);
        for (const el of existing) {
            if (matches(el)) {
                handleAdded(el);
            }
        }
    }

    // Subscribe to global observer
    const unsubscribe = globalObserver.subscribe(handleMutations);

    return {
        stop() {
            if (!active) {
                return;
            }
            active = false;
            unsubscribe();

            // Run cleanup functions for all elements that are still being tracked
            // This ensures resources (like MutationObservers) are properly released
            // even if the elements haven't been removed from the DOM yet
            for (const el of processed) {
                const cleanup = cleanups.get(el);
                if (cleanup) {
                    try {
                        cleanup();
                    } catch (e) {
                        console.error('[BloomDOM] cleanup error on stop:', e);
                    }
                }
            }
            
            // Clear all tracking state
            cleanups.clear();
            processed.clear();
        },
        get active() {
            return active;
        },
    };
}

/**
 * Wait for an element matching the selector to appear in the DOM.
 * 
 * @param selector - CSS selector to match
 * @param options - Wait options
 * @returns Promise that resolves with the element
 */
export function waitFor<T extends Element = Element>(
    selector: string,
    options: WaitForOptions = {}
): Promise<T> {
    const { timeout = 10000, parent = document } = options;

    return new Promise((resolve, reject) => {
        // Check immediately
        const existing = parent.querySelector<T>(selector);
        if (existing) {
            resolve(existing);
            return;
        }

        let observer: MutationObserver | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
            observer?.disconnect();
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };

        observer = new MutationObserver(() => {
            const el = parent.querySelector<T>(selector);
            if (el) {
                cleanup();
                resolve(el);
            }
        });

        const observeTarget = parent instanceof Document ? parent.body : parent;
        observer.observe(observeTarget, { childList: true, subtree: true });

        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`[BloomDOM] Timeout waiting for "${selector}"`));
            }, timeout);
        }
    });
}

/**
 * Wait for an element, returning null instead of throwing on timeout.
 */
export async function waitForOptional<T extends Element = Element>(
    selector: string,
    options: WaitForOptions = {}
): Promise<T | null> {
    try {
        return await waitFor<T>(selector, options);
    } catch {
        return null;
    }
}

// ============================================================================
// Default Export
// ============================================================================

const bloom = {
    watch,
    waitFor,
    waitForOptional,
};

export default bloom;

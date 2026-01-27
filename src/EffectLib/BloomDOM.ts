/**
 * BloomDOM - VSBloom's DOM Observation & Element Interaction Library
 * 
 * Provides high-level, performant utilities for:
 * - Waiting for elements to appear in the DOM
 * - Watching for elements matching selectors to be added/removed
 * - Watching container children with automatic reconnection
 */

/// <reference lib="dom" />

// ============================================================================
// Types & Interfaces
// ============================================================================

function warn(message: string, data?: unknown) {
    //Try and use the proper VSBloom logging system if available
    if (typeof window !== 'undefined' && (window as any).__VSBLOOM__) {
        (window as any).__VSBLOOM__.Log('warn', message, data);
    } else {
        //If not available, use console.warn
        console.warn('[BloomDOM] ' + message, data);
    }
}

/** Cleanup function that can be returned from onAdded callbacks */
export type CleanupFn = () => void;

export interface WaitForOptions {
    /** Parent element to search within (default: document) */
    parent?: Element | Document;
    /** Timeout in milliseconds (default: 10000, 0 = no timeout) */
    timeout?: number;
}

export interface WatchHandle {
    /** Stop watching and disconnect all observers */
    stop(): void;
    /** Whether the watcher is currently active */
    readonly active: boolean;
    /** Promise that resolves when observation has started */
    readonly ready: Promise<void>;
}

export interface WatchConfig {
    /** 
     * Called when a matching element is added to the DOM.
     * Can optionally return a cleanup function that will be called when the element is removed.
     */
    onAdded?: (element: Element) => CleanupFn | void;
    /** Called when a matching element is removed from the DOM (after any cleanup function) */
    onRemoved?: (element: Element) => void;
    
    /** Scope observation to within a specific container selector */
    within?: string;
    /** Called when the `within` container is recreated in the DOM */
    onContainerRecreated?: (newContainer: Element) => void;
    /** Automatically reconnect if the `within` container is recreated (default: true) */
    autoReconnect?: boolean;
    
    /** Process elements that already exist when watch starts (default: true) */
    processExisting?: boolean;
    /** 
     * How to match elements within the container:
     * - true: match selector anywhere in subtree (default)
     * - false: only match direct children of `within` container that match selector
     * 
     * Note: When `within` is not specified, this is always true (subtree of document).
     */
    deep?: boolean;
}

// ============================================================================
// Global DOM Observer (Single Observer Pattern)
// ============================================================================

type GlobalObserverCallback = (added: Element[], removed: Element[]) => void;

/**
 * Singleton global observer that watches the stable ancestor for all DOM mutations.
 * Watchers subscribe to this instead of creating individual observers.
 * This dramatically reduces overhead when multiple watchers are active.
 */
class GlobalDOMObserver {
    private observer: MutationObserver | null = null;
    private subscribers = new Set<GlobalObserverCallback>();
    private root: Element | null = null;
    private pendingAdded = new Set<Element>();
    private pendingRemoved = new Set<Element>();
    private scheduled = false;
    private initPromise: Promise<void> | null = null;

    /**
     * Subscribe to global DOM mutations.
     * @returns Unsubscribe function
     */
    subscribe(callback: GlobalObserverCallback): () => void {
        this.subscribers.add(callback);
        this.ensureObserving();
        return () => this.unsubscribe(callback);
    }

    /**
     * Unsubscribe from global DOM mutations.
     * Automatically stops observing when no subscribers remain.
     */
    unsubscribe(callback: GlobalObserverCallback): void {
        this.subscribers.delete(callback);
        if (this.subscribers.size === 0) {
            this.stopObserving();
        }
    }

    /** Get the current observation root element */
    getRoot(): Element | null {
        return this.root;
    }

    /** Wait for the global observer to be initialized */
    async waitForReady(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
    }

    private ensureObserving(): void {
        if (this.observer) {
            return;
        }

        this.initPromise = this.startObserving();
    }

    private async startObserving(): Promise<void> {
        // Wait for a stable ancestor to exist
        this.root = await this.findStableAncestor();
        
        this.observer = new MutationObserver(this.handleMutations.bind(this));
        this.observer.observe(this.root, { 
            childList: true, 
            subtree: true 
        });
    }

    private async findStableAncestor(): Promise<Element> {
        // Try to find VSCode's workbench container, fall back to body
        const workbench = document.querySelector('.monaco-workbench') 
            || document.querySelector('.monaco-shell');
        
        if (workbench) {
            return workbench;
        }

        // If not found, wait briefly for it
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const wb = document.querySelector('.monaco-workbench') 
                    || document.querySelector('.monaco-shell');
                if (wb) {
                    clearInterval(checkInterval);
                    resolve(wb);
                }
            }, 50);

            // Fallback to body after 2 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve(document.body);
            }, 2000);
        });
    }

    private handleMutations(mutations: MutationRecord[]): void {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof Element) {
                    this.pendingAdded.add(node);
                    // If this element was also in pendingRemoved, it was moved - remove from removed
                    this.pendingRemoved.delete(node);
                }
            }
            for (const node of mutation.removedNodes) {
                if (node instanceof Element) {
                    this.pendingRemoved.add(node);
                    // If this element was also in pendingAdded, it was moved - remove from added
                    this.pendingAdded.delete(node);
                }
            }
        }

        if (!this.scheduled && (this.pendingAdded.size > 0 || this.pendingRemoved.size > 0)) {
            this.scheduled = true;
            requestAnimationFrame(() => {
                const added = [...this.pendingAdded];
                const removed = [...this.pendingRemoved];
                this.pendingAdded.clear();
                this.pendingRemoved.clear();
                this.scheduled = false;

                // Notify all subscribers
                for (const callback of this.subscribers) {
                    try {
                        callback(added, removed);
                    } catch (e) {
                        warn('[BloomDOM] Subscriber callback threw:', e);
                    }
                }
            });
        }
    }

    private stopObserving(): void {
        if (this.observer) {
            // Drain any pending mutations before disconnecting
            this.observer.takeRecords();
            this.observer.disconnect();
        }
        this.observer = null;
        this.root = null;
        this.initPromise = null;
        this.pendingAdded.clear();
        this.pendingRemoved.clear();
        this.scheduled = false;
    }
}

/** Singleton global observer instance */
const globalObserver = new GlobalDOMObserver();

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Check if element is a descendant of any element in the set.
 * Used to optimize querySelectorAll by skipping elements whose ancestors are also being processed.
 */
function isDescendantOfAny(element: Element, ancestors: Set<Element>): boolean {
    let parent = element.parentElement;
    while (parent) {
        if (ancestors.has(parent)) {
            return true;
        }
        parent = parent.parentElement;
    }
    return false;
}

/**
 * Filter out elements that are descendants of other elements in the array.
 * This optimizes querySelectorAll by only searching from root-level additions.
 */
function filterToRoots(elements: Element[]): Element[] {
    const elementSet = new Set(elements);
    const roots: Element[] = [];
    
    for (const el of elements) {
        if (!isDescendantOfAny(el, elementSet)) {
            roots.push(el);
        }
    }
    
    return roots;
}

/**
 * Validate that a selector is valid CSS.
 * @throws Error if selector is invalid
 */
function validateSelector(selector: string): void {
    try {
        document.querySelector(selector);
    } catch (e) {
        throw new Error(`[BloomDOM] Invalid CSS selector: "${selector}"`);
    }
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Wait for an element matching the selector to appear in the DOM.
 * 
 * @param selector - CSS selector to match
 * @param options - Configuration options
 * @returns Promise that resolves with the element
 * 
 * @example
 * ```ts
 * // Wait for the workbench to be ready
 * const workbench = await bloom.waitFor('.monaco-workbench');
 * 
 * // Wait with timeout
 * const panel = await bloom.waitFor('.panel', { timeout: 5000 });
 * 
 * // Wait within a specific parent
 * const tab = await bloom.waitFor('.tab', { parent: tabsContainer });
 * ```
 */
export function waitFor<T extends Element = Element>(
    selector: string,
    options: WaitForOptions = {}
): Promise<T> {
    const { parent = document, timeout = 10000 } = options;

    validateSelector(selector);

    return new Promise((resolve, reject) => {
        // Check immediately first
        const existing = parent.querySelector<T>(selector);
        if (existing) {
            resolve(existing);
            return;
        }

        let observer: MutationObserver | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
            if (observer) {
                observer.takeRecords();
                observer.disconnect();
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };

        observer = new MutationObserver(() => {
            const element = parent.querySelector<T>(selector);
            if (element) {
                cleanup();
                resolve(element);
            }
        });

        observer.observe(parent instanceof Document ? parent.body : parent, {
            childList: true,
            subtree: true
        });

        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                cleanup();
                const parentInfo = parent instanceof Document 
                    ? 'document' 
                    : `<${parent.tagName.toLowerCase()}${parent.className ? '.' + parent.className.split(' ')[0] : ''}>`;
                reject(new Error(`[BloomDOM] Timeout waiting for "${selector}" within ${parentInfo} after ${timeout}ms`));
            }, timeout);
        }
    });
}

/**
 * Wait for an element, but return null instead of throwing on timeout.
 * Useful when an element is optional.
 * 
 * @param selector - CSS selector to match
 * @param options - Configuration options
 * @returns Promise that resolves with the element or null
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

/**
 * Watch for elements matching a selector to be added or removed from the DOM.
 * 
 * This is the unified watching API that handles:
 * - Watching for elements anywhere in the document
 * - Scoping to a specific container with `within`
 * - Watching only direct children with `deep: false`
 * - Auto-reconnection when containers are recreated
 * 
 * All watchers share a single global observer for optimal performance.
 * 
 * @param selector - CSS selector to match
 * @param config - Watcher configuration
 * @returns Handle to stop watching
 * 
 * @example
 * ```ts
 * // Watch for tabs anywhere in the document
 * const handle = bloom.watch('.tab', {
 *     onAdded: (tab) => {
 *         gsap.fromTo(tab, { opacity: 0 }, { opacity: 1 });
 *         return () => console.log('cleanup on removal');
 *     },
 * });
 * 
 * // Watch within a specific container
 * const handle = bloom.watch('.tab', {
 *     within: '.tabs-container',
 *     onAdded: (tab) => { ... },
 *     onContainerRecreated: (container) => console.log('container rebuilt'),
 * });
 * 
 * // Watch only direct children of a container
 * const handle = bloom.watch('.list-item', {
 *     within: '.list-container',
 *     deep: false, // only direct children
 *     onAdded: (item) => { ... },
 * });
 * 
 * // Wait for watcher to be ready before continuing
 * await handle.ready;
 * 
 * // Stop watching
 * handle.stop();
 * ```
 */
export function watch(
    selector: string,
    config: WatchConfig = {}
): WatchHandle {
    const {
        onAdded,
        onRemoved,
        within,
        onContainerRecreated,
        autoReconnect = true,
        processExisting = true,
        deep = true,
    } = config;

    validateSelector(selector);
    if (within) {
        validateSelector(within);
    }

    // State
    const processedElements = new WeakSet<Element>();
    const cleanupFunctions = new WeakMap<Element, CleanupFn>();
    let currentContainer: Element | null = null;
    let containerObserver: MutationObserver | null = null;
    let globalUnsubscribe: (() => void) | null = null;
    let active = true;
    let readyResolve: () => void;
    const readyPromise = new Promise<void>((resolve) => {
        readyResolve = resolve;
    });

    /**
     * Check if an element matches our criteria
     */
    const matchesSelector = (element: Element): boolean => {
        try {
            return element.matches(selector);
        } catch {
            return false;
        }
    };

    /**
     * Process an added element, finding all matching descendants
     */
    const processAddedElement = (element: Element, container: Element | null): void => {
        const matches: Element[] = [];

        if (within && container) {
            // Scoped mode: only process if element is within our container
            if (!container.contains(element) && element !== container) {
                return;
            }

            if (deep) {
                // Deep mode: check element and all descendants
                if (matchesSelector(element)) {
                    matches.push(element);
                }
                const descendants = element.querySelectorAll(selector);
                for (const desc of descendants) {
                    matches.push(desc);
                }
            } else {
                // Shallow mode: only direct children of container that match
                if (element.parentElement === container && matchesSelector(element)) {
                    matches.push(element);
                }
                // Also check if the added element IS our container (was just added)
                // and process its direct children
                if (element === container) {
                    for (const child of container.children) {
                        if (matchesSelector(child)) {
                            matches.push(child);
                        }
                    }
                }
            }
        } else {
            // Unscoped mode: always deep
            if (matchesSelector(element)) {
                matches.push(element);
            }
            const descendants = element.querySelectorAll(selector);
            for (const desc of descendants) {
                matches.push(desc);
            }
        }

        // Process matches
        for (const match of matches) {
            if (!processedElements.has(match)) {
                processedElements.add(match);
                if (onAdded) {
                    try {
                        const cleanup = onAdded(match);
                        if (cleanup) {
                            cleanupFunctions.set(match, cleanup);
                        }
                    } catch (e) {
                        warn('[BloomDOM] onAdded callback threw:', e);
                    }
                }
            }
        }
    };

    /**
     * Process a removed element, finding all matching descendants
     */
    const processRemovedElement = (element: Element): void => {
        const matches: Element[] = [];

        // Check the element itself
        if (matchesSelector(element) && processedElements.has(element)) {
            matches.push(element);
        }

        // Check descendants
        const descendants = element.querySelectorAll(selector);
        for (const desc of descendants) {
            if (processedElements.has(desc)) {
                matches.push(desc);
            }
        }

        // Process removals
        for (const match of matches) {
            // Run cleanup function if registered
            const cleanup = cleanupFunctions.get(match);
            if (cleanup) {
                try {
                    cleanup();
                } catch (e) {
                    warn('[BloomDOM] Cleanup function threw:', e);
                }
                cleanupFunctions.delete(match);
            }

            if (onRemoved) {
                try {
                    onRemoved(match);
                } catch (e) {
                    warn('[BloomDOM] onRemoved callback threw:', e);
                }
            }
            
            // Note: We don't delete from processedElements (WeakSet handles GC)
            // This also prevents re-processing if element is somehow re-added
        }
    };

    /**
     * Attach observer to a container for scoped watching
     */
    const attachToContainer = (container: Element, isReconnect: boolean): void => {
        // Disconnect old container observer
        if (containerObserver) {
            containerObserver.takeRecords();
            containerObserver.disconnect();
        }
        currentContainer = container;

        if (isReconnect && onContainerRecreated) {
            try {
                onContainerRecreated(container);
            } catch (e) {
                warn('[BloomDOM] onContainerRecreated callback threw:', e);
            }
        }

        // Process existing elements
        if (processExisting || isReconnect) {
            if (deep) {
                const existing = container.querySelectorAll(selector);
                for (const el of existing) {
                    if (!processedElements.has(el)) {
                        processedElements.add(el);
                        if (onAdded) {
                            try {
                                const cleanup = onAdded(el);
                                if (cleanup) {
                                    cleanupFunctions.set(el, cleanup);
                                }
                            } catch (e) {
                                warn('[BloomDOM] onAdded callback threw:', e);
                            }
                        }
                    }
                }
            } else {
                // Shallow: only direct children
                for (const child of container.children) {
                    if (matchesSelector(child) && !processedElements.has(child)) {
                        processedElements.add(child);
                        if (onAdded) {
                            try {
                                const cleanup = onAdded(child);
                                if (cleanup) {
                                    cleanupFunctions.set(child, cleanup);
                                }
                            } catch (e) {
                                warn('[BloomDOM] onAdded callback threw:', e);
                            }
                        }
                    }
                }
            }
        }

        // Create a local observer for the container (more efficient than global for scoped watching)
        let pendingAdded = new Set<Element>();
        let pendingRemoved = new Set<Element>();
        let scheduled = false;

        containerObserver = new MutationObserver((mutations) => {
            if (!active) {
                return;
            }

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) {
                        pendingAdded.add(node);
                        pendingRemoved.delete(node);
                    }
                }
                for (const node of mutation.removedNodes) {
                    if (node instanceof Element) {
                        pendingRemoved.add(node);
                        pendingAdded.delete(node);
                    }
                }
            }

            if (!scheduled && (pendingAdded.size > 0 || pendingRemoved.size > 0)) {
                scheduled = true;
                requestAnimationFrame(() => {
                    if (!active) {
                        return;
                    }

                    // Optimize: filter to root elements to avoid redundant querySelectorAll
                    const addedRoots = filterToRoots([...pendingAdded]);
                    const removed = [...pendingRemoved];
                    pendingAdded = new Set();
                    pendingRemoved = new Set();
                    scheduled = false;

                    for (const el of addedRoots) {
                        processAddedElement(el, currentContainer);
                    }
                    for (const el of removed) {
                        processRemovedElement(el);
                    }
                });
            }
        });

        containerObserver.observe(container, {
            childList: true,
            subtree: deep
        });
    };

    /**
     * Handle global mutations (used for reconnection detection)
     */
    const handleGlobalMutations = (added: Element[], removed: Element[]): void => {
        if (!active || !within || !autoReconnect) {
            return;
        }

        // Check if our container was removed
        if (currentContainer && !currentContainer.isConnected) {
            // Look for a new container in the added elements
            for (const el of added) {
                if (el.matches(within)) {
                    attachToContainer(el, true);
                    return;
                }
                const newContainer = el.querySelector(within);
                if (newContainer) {
                    attachToContainer(newContainer, true);
                    return;
                }
            }

            // If not found in added elements, query the DOM
            const newContainer = document.querySelector(within);
            if (newContainer) {
                attachToContainer(newContainer, true);
            }
        }
    };

    /**
     * Initialize watching
     */
    const startWatching = async (): Promise<void> => {
        if (!active) {
            readyResolve();
            return;
        }

        if (within) {
            // Scoped mode: wait for container
            try {
                const container = await waitFor(within, { timeout: 10000 });
                if (!active) {
                    readyResolve();
                    return;
                }

                attachToContainer(container, false);

                // Subscribe to global observer for reconnection detection
                if (autoReconnect) {
                    globalUnsubscribe = globalObserver.subscribe(handleGlobalMutations);
                }

                readyResolve();
            } catch (error) {
                warn(`[BloomDOM] Could not find container "${within}":`, error);
                readyResolve();
            }
        } else {
            // Unscoped mode: watch entire document via global observer
            await globalObserver.waitForReady();
            
            if (!active) {
                readyResolve();
                return;
            }

            // Process existing elements
            if (processExisting) {
                const existing = document.querySelectorAll(selector);
                for (const el of existing) {
                    if (!processedElements.has(el)) {
                        processedElements.add(el);
                        if (onAdded) {
                            try {
                                const cleanup = onAdded(el);
                                if (cleanup) {
                                    cleanupFunctions.set(el, cleanup);
                                }
                            } catch (e) {
                                warn('[BloomDOM] onAdded callback threw:', e);
                            }
                        }
                    }
                }
            }

            // Subscribe to global mutations
            globalUnsubscribe = globalObserver.subscribe((added, removed) => {
                if (!active) {
                    return;
                }

                // Optimize: filter to root elements
                const addedRoots = filterToRoots(added);
                
                for (const el of addedRoots) {
                    processAddedElement(el, null);
                }
                for (const el of removed) {
                    processRemovedElement(el);
                }
            });

            readyResolve();
        }
    };

    // Start watching
    startWatching();

    return {
        stop() {
            if (!active) {
                return;
            }
            
            active = false;

            // Unsubscribe from global observer
            if (globalUnsubscribe) {
                globalUnsubscribe();
                globalUnsubscribe = null;
            }

            // Disconnect container observer
            if (containerObserver) {
                containerObserver.takeRecords();
                containerObserver.disconnect();
                containerObserver = null;
            }

            currentContainer = null;
        },
        get active() {
            return active;
        },
        get ready() {
            return readyPromise;
        }
    };
}

// ============================================================================
// Main Export Object
// ============================================================================

/**
 * BloomDOM - The main API object.
 * 
 * @example
 * ```ts
 * import bloom from 'bloom';
 * 
 * // Wait for element
 * const el = await bloom.waitFor('.monaco-workbench');
 * 
 * // Watch for elements (unified API)
 * const handle = bloom.watch('.tab', {
 *     onAdded: (tab) => {
 *         gsap.fromTo(tab, { opacity: 0 }, { opacity: 1 });
 *         return () => console.log('tab removed');
 *     },
 *     within: '.tabs-container', // optional: scope to container
 *     deep: false, // optional: only direct children
 * });
 * 
 * // Wait for watcher to be ready
 * await handle.ready;
 * 
 * // Stop watching
 * handle.stop();
 * ```
 */
const bloom = {
    waitFor,
    waitForOptional,
    watch
};

export default bloom;

/**
 * BloomDOM - VSBloom's DOM Observation & Element Interaction Library
 * 
 * Provides high-level, performant utilities for:
 * - Waiting for elements to appear in the DOM
 * - Watching for elements matching selectors to be added/removed
 * - Watching container children with automatic reconnection
 * 
 * All watchers handle deduplication, batching, and cleanup automatically.
 */

/// <reference lib="dom" />

// ============================================================================
// Types & Interfaces
// ============================================================================

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
}

export interface ElementWatcherConfig {
    /** Called when a matching element is added to the DOM */
    onAdded?: (element: Element) => void;
    /** Called when a matching element is removed from the DOM */
    onRemoved?: (element: Element) => void;
    /** Scope observation to within a specific container selector */
    within?: string;
    /** Process elements that already exist when watch starts (default: true) */
    processExisting?: boolean;
}

export interface ContainerWatcherConfig {
    /** Called when a child element is added to the container */
    onChildAdded?: (child: Element) => void;
    /** Called when a child element is removed from the container */
    onChildRemoved?: (child: Element) => void;
    /** Called when the container itself is recreated in the DOM */
    onContainerRecreated?: (newContainer: Element) => void;
    /** Automatically reconnect if the container is recreated (default: true) */
    autoReconnect?: boolean;
    /** Process existing children when watch starts (default: true) */
    processExisting?: boolean;
    /** Also observe descendants, not just direct children (default: false) */
    deep?: boolean;
}

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Find a stable ancestor element for reconnection watching.
 * Prefers known stable VSCode containers, falls back to body.
 */
function findStableAncestor(): Element {
    return document.querySelector('.monaco-workbench') 
        || document.querySelector('.monaco-shell')
        || document.body;
}

/**
 * Creates a mutation callback that batches calls using requestAnimationFrame
 */
function createBatchedCallback(
    processor: (added: Element[], removed: Element[]) => void
): MutationCallback {
    let pendingAdded: Element[] = [];
    let pendingRemoved: Element[] = [];
    let scheduled = false;

    return (mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node instanceof Element) {
                    pendingAdded.push(node);
                }
            });
            mutation.removedNodes.forEach(node => {
                if (node instanceof Element) {
                    pendingRemoved.push(node);
                }
            });
        }

        if (!scheduled && (pendingAdded.length > 0 || pendingRemoved.length > 0)) {
            scheduled = true;
            requestAnimationFrame(() => {
                const added = pendingAdded;
                const removed = pendingRemoved;
                pendingAdded = [];
                pendingRemoved = [];
                scheduled = false;
                processor(added, removed);
            });
        }
    };
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
            observer?.disconnect();
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
                reject(new Error(`[BloomDOM] Timeout waiting for "${selector}" after ${timeout}ms`));
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
 * Automatically handles deduplication - callbacks only fire once per element.
 * 
 * @param selector - CSS selector to match
 * @param config - Watcher configuration
 * @returns Handle to stop watching
 * 
 * @example
 * ```ts
 * // Animate new tabs as they appear
 * const handle = bloom.watchElements('.tab', {
 *     onAdded: (tab) => gsap.fromTo(tab, { opacity: 0 }, { opacity: 1 }),
 *     onRemoved: (tab) => console.log('Tab removed'),
 * });
 * 
 * // Scope to a specific container
 * const handle = bloom.watchElements('.list-item', {
 *     within: '.sidebar',
 *     onAdded: (item) => { ... },
 * });
 * 
 * // Later: stop watching
 * handle.stop();
 * ```
 */
export function watchElements(
    selector: string,
    config: ElementWatcherConfig
): WatchHandle {
    const {
        onAdded,
        onRemoved,
        within,
        processExisting = true,
    } = config;

    const processedElements = new WeakSet<Element>();
    let observer: MutationObserver | null = null;
    let active = true;

    const processElement = (element: Element, isAdded: boolean) => {
        // Check if this element or any of its descendants match
        const matches: Element[] = [];
        
        if (element.matches(selector)) {
            matches.push(element);
        }
        matches.push(...Array.from(element.querySelectorAll(selector)));

        for (const match of matches) {
            if (isAdded) {
                if (!processedElements.has(match)) {
                    processedElements.add(match);
                    onAdded?.(match);
                }
            } else {
                // For removed elements, we don't check processedElements
                // since we want to notify even if the parent was removed
                onRemoved?.(match);
            }
        }
    };

    const startWatching = async () => {
        // Determine observation root
        let root: Element;
        if (within) {
            try {
                root = await waitFor(within, { timeout: 10000 });
            } catch {
                console.warn(`[BloomDOM] Could not find container "${within}" for watchElements`);
                return;
            }
        } else {
            root = findStableAncestor();
        }

        // Process existing elements
        if (processExisting) {
            root.querySelectorAll(selector).forEach(el => {
                if (!processedElements.has(el)) {
                    processedElements.add(el);
                    onAdded?.(el);
                }
            });
        }

        // Set up observer
        const callback = createBatchedCallback((added, removed) => {
            if (!active) {
                return;
            }
            added.forEach(el => processElement(el, true));
            removed.forEach(el => processElement(el, false));
        });

        observer = new MutationObserver(callback);
        observer.observe(root, {
            childList: true,
            subtree: true
        });
    };

    startWatching();

    return {
        stop() {
            active = false;
            observer?.disconnect();
            observer = null;
        },
        get active() {
            return active;
        }
    };
}

/**
 * Watch a container for child elements being added or removed.
 * Automatically handles container recreation (e.g., when VSCode rebuilds UI sections).
 * 
 * @param containerSelector - CSS selector for the container
 * @param config - Watcher configuration
 * @returns Handle to stop watching
 * 
 * @example
 * ```ts
 * // Watch for tabs being added/removed
 * const handle = bloom.watchContainer('.tabs-container', {
 *     onChildAdded: (tab) => {
 *         gsap.fromTo(tab, { opacity: 0, y: -10 }, { opacity: 1, y: 0 });
 *     },
 *     onChildRemoved: (tab) => {
 *         console.log('Tab was removed');
 *     },
 *     onContainerRecreated: (newContainer) => {
 *         console.log('Tabs container was rebuilt');
 *     },
 * });
 * 
 * // Later: stop watching
 * handle.stop();
 * ```
 */
export function watchContainer(
    containerSelector: string,
    config: ContainerWatcherConfig
): WatchHandle {
    const {
        onChildAdded,
        onChildRemoved,
        onContainerRecreated,
        autoReconnect = true,
        processExisting = true,
        deep = false,
    } = config;

    const processedChildren = new WeakSet<Element>();
    let currentContainer: Element | null = null;
    let containerObserver: MutationObserver | null = null;
    let reconnectObserver: MutationObserver | null = null;
    let active = true;

    const processChild = (child: Element, isAdded: boolean) => {
        if (isAdded) {
            if (!processedChildren.has(child)) {
                processedChildren.add(child);
                onChildAdded?.(child);
            }
        } else {
            onChildRemoved?.(child);
        }
    };

    const attachToContainer = (container: Element, isReconnect = false) => {
        // Disconnect old observer
        containerObserver?.disconnect();
        currentContainer = container;

        if (isReconnect) {
            onContainerRecreated?.(container);
        }

        // Process existing children
        if (processExisting || isReconnect) {
            const children = deep 
                ? container.querySelectorAll('*')
                : container.children;
            
            Array.from(children).forEach(child => {
                if (child instanceof Element && !processedChildren.has(child)) {
                    processedChildren.add(child);
                    onChildAdded?.(child);
                }
            });
        }

        // Watch for new children
        const callback = createBatchedCallback((added, removed) => {
            if (!active) {
                return;
            }
            added.forEach(el => processChild(el, true));
            removed.forEach(el => processChild(el, false));
        });

        containerObserver = new MutationObserver(callback);
        containerObserver.observe(container, {
            childList: true,
            subtree: deep
        });
    };

    const startWatching = async () => {
        try {
            const container = await waitFor(containerSelector);
            if (!active) {
                return;
            }
            
            attachToContainer(container, false);

            // Set up reconnection observer if enabled
            if (autoReconnect) {
                const stableAncestor = findStableAncestor();
                
                reconnectObserver = new MutationObserver(() => {
                    if (!active) {
                        return;
                    }
                    
                    const newContainer = document.querySelector(containerSelector);
                    if (newContainer && newContainer !== currentContainer) {
                        attachToContainer(newContainer, true);
                    }
                });

                reconnectObserver.observe(stableAncestor, {
                    childList: true,
                    subtree: true
                });
            }
        } catch (error) {
            console.warn(`[BloomDOM] Could not find container "${containerSelector}":`, error);
        }
    };

    startWatching();

    return {
        stop() {
            active = false;
            containerObserver?.disconnect();
            reconnectObserver?.disconnect();
            containerObserver = null;
            reconnectObserver = null;
            currentContainer = null;
        },
        get active() {
            return active;
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
 * // Watch elements with config
 * const handle = bloom.watchElements('.tab', {
 *     onAdded: (tab) => gsap.fromTo(tab, { opacity: 0 }, { opacity: 1 }),
 *     processExisting: false,
 * });
 * 
 * // Watch container children
 * const containerHandle = bloom.watchContainer('.tabs-container', {
 *     onChildAdded: (child) => { ... },
 *     onContainerRecreated: (container) => { ... },
 * });
 * 
 * // Stop watching
 * handle.stop();
 * ```
 */
const bloom = {
    waitFor,
    waitForOptional,
    watchElements,
    watchContainer
};

export default bloom;

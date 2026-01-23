/**
 * VSBloom Bridge
 * 
 * Provides constant definitions as well as
 * message type/interface definitions for
 * communication between the VSC extension
 * and the patched VSBloom client running
 * within the Electron Renderer process
 * 
 */

//Extension -> Client Message
export interface ContentReplicationRequestMessage {
    type: 'replicate-content';
    id: string;
    contentType: "css" | "js";
    payload: string;
}
export interface RemovalRequestMessage {
    type: 'remove';
    id: string;
}
export interface ConfigMessage {
    type: 'replicate-extension-config';
    settings: VSBloomClientConfig;
}
export interface KeepAliveRequestMessage {
    type: 'are-u-alive';
}
export interface RequestClientReloadMessage {
    type: 'request-client-reload';
}
export type ExtensionToClientMessage =
    | ContentReplicationRequestMessage
    | RemovalRequestMessage
    | ConfigMessage
    | KeepAliveRequestMessage
    | RequestClientReloadMessage;

//Client -> Extension Message
export interface ReadyMessage {
    type: 'client-ready';
    windowId: string;
}
export interface KeepAliveResponseMessage {
    type: 'i-am-alive';
}
export interface LogMessage {
    type: 'replicate-log';
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: unknown;
}
export interface EventMessage {
    type: 'event';
    name: string;
    data: unknown;
}
export type ClientToExtensionMessage =
    | ReadyMessage
    | KeepAliveResponseMessage
    | LogMessage
    | EventMessage;

//Configuration Types
/**
 * General primitives that are 'expected' to be found within
 * the VSBloom extension configuration
 */
export type VSBloomConfigValue = string | number | boolean | null | undefined;

/**
 * Represents the nested config structure that the
 * VSBloom extension configuration follows
 */
export interface VSBloomConfigObject {
    [key: string]: VSBloomConfigValue | VSBloomConfigObject;
}

/**
 * This is the actual extension configuration that gets
 * extracted from the VSBloom extension's VSCode settings;
 * this type is intentionally a bit opaque to prevent a
 * situation where we have to manually update this type
 * whenever new configuration options are added to the
 * extension's package.json file
 * 
 * I guaruntee there's a better way to do this or to generate
 * the type information from the actual package.json file entry's
 * structure, but I am not versed in TS black magic enough to do
 * so yet so for now this will work nicely :)
 */
export type VSBloomClientConfig = VSBloomConfigObject;

//Config Accessor Helpers

/**
 * Type-safe accessor for nested configuration values,
 * navigates a dot-separated path (e.g., "cursorTrail.enabled") and returns
 * the found value with the specified type, or a default value if not found
 * 
 * @param config The configuration object to access
 * @param path Dot-separated path to the value (e.g., "cursorTrail.enabled")
 * @param defaultValue Default value to return if path doesn't exist or value is wrong type
 * @returns The config value cast to `T`, or `defaultValue` if not found or of wrong type
 * 
 * @example
 * const enabled = getConfigValue(config, 'cursorTrail.enabled', false);
 * const duration = getConfigValue(config, 'cursorTrail.duration', 750);
 */
export function GetExtensionConfigValue<T extends VSBloomConfigValue>(
    config: VSBloomClientConfig,
    path: string,
    defaultValue: T
): T {
    const parts = path.split('.');
    let current: VSBloomConfigValue | VSBloomConfigObject = config;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return defaultValue;
        }
        if (typeof current !== 'object') {
            return defaultValue;
        }
        current = (current as VSBloomConfigObject)[part];
    }

    //if the final value generally isnt found, return the default value
    if (current === null || current === undefined) {
        return defaultValue;
    }

    //if the final value is found but it's of the wrong type, return the default value
    const expectedType = typeof defaultValue;
    if (typeof current !== expectedType) {
        return defaultValue;
    }

    return current as T;
}

/**
 * Checks if a configuration section exists and is an object,
 * since we're working with extension configuration structures
 * that generally stay static barring extension updates, this is
 * teeechnically pointless - but it's nice for being nice and
 * 'explicit' about type safety/following 'best practices'
 * 
 * @param config The configuration object
 * @param section The section name to check (e.g., "cursorTrail")
 * @returns True if the section exists and is an object
 */
export function DoesConfigObjectHaveSection(config: VSBloomClientConfig, section: string): boolean {
    const value = config[section];
    return value !== null && value !== undefined && typeof value === 'object';
}

//Bridge Constants

/**
 * Port used for the Websocket server hosted by the extension,
 * this is statically baked into the VSBloom Client script's
 * source code, so it must either remain a constant value like
 * this or be deterministic in such a manner that both the
 * client and server can independently agree on the same port
 * value without needing any kind of prior communication or
 * handshake to do so
 * 
 */
export const VSBLOOM_BRIDGE_PORT = 52847;

/**
 * maximum reconnection delay - in milliseconds - for the client
 */
export const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * initial reconnection delay - in milliseconds - for the client
 */
export const INITIAL_RECONNECT_DELAY_MS = 1000;

/**
 * keep-alive ping interval - in milliseconds - for the client
 */
export const PING_INTERVAL_MS = 30000;

/**
 * "close code" constants used to make communication between
 * the client and server easier to follow without needing to
 * explicitly vomit magic numbers all over the codebase
 */
export const WS_CLOSE_CODES = {
    NORMAL: 1000,
    GOING_AWAY: 1001,
    UNAUTHORIZED: 4001,
    INVALID_MESSAGE: 4002,
} as const;

import type { WebviewApi } from "vscode-webview";
import type { BloomToSveltePayload, SvelteToBloomPayload } from "../WebviewNetworking";
import { directories } from "../Global/Directories.svelte";

export type BloomToSvelteMessageObserver<MessageType extends BloomToSveltePayload['type']> = (data: Extract<BloomToSveltePayload, { type: MessageType }>['data']) => void;

class VSCodeAPI {
    private readonly vscode: WebviewApi<unknown> = acquireVsCodeApi();
    private readonly bloomToSvelteMessageObservers: Map<BloomToSveltePayload['type'], Set<BloomToSvelteMessageObserver<BloomToSveltePayload['type']>>> = new Map();

    constructor() {
        this.InitializeWindowMessageListener();
        this.InitializeWebviewImageDirectory();
    }

    private InitializeWebviewImageDirectory() {
        const pageElement = document.getElementById('page');
        if (!pageElement) {
            this.PostToExtension({
                type: 'send-notification',
                data: {
                    type: 'error',
                    message: '[VSBloom]: Unable to resolve page element within menu webview.'
                }
            });
            return;
        }

        const webviewImageryURI = pageElement.getAttribute('webview-imagery-uri');
        if (!webviewImageryURI) {
            this.PostToExtension({
                type: 'send-notification',
                data: {
                    type: 'error',
                    message: '[VSBloom]: Unable to resolve image directory within menu webview - attribute was empty during initial read.'
                }
            });
            return;
        }

        directories.imagery = webviewImageryURI;
    }
    
    private InitializeWindowMessageListener() {
        window.addEventListener('message', event => {
            const message = event.data as BloomToSveltePayload;

            const observerList = this.bloomToSvelteMessageObservers.get(message.type);
            if (observerList) {
                for (const observer of observerList) {
                    try {
                        observer(message.data);
                    } catch (error) {
                        console.error(`[VSBloom]: An error occurred while calling an observer for message type ${message.type} in the VSBloom Menu: ${error instanceof Error ? error.message : String(error)}`);
                        this.PostToExtension({
                            type: 'send-notification',
                            data: {
                                type: 'error',
                                message: `[VSBloom]: An error occurred while calling an observer for message type ${message.type} in the VSBloom Menu: ${error instanceof Error ? error.message : String(error)}`
                            }
                        });
                    }
                }
            } else {
                console.error(`[VSBloom]: No observers were registered for message type ${message.type} in the VSBloom Menu, so an event of this type was missed.`);
                this.PostToExtension({
                    type: 'send-notification',
                    data: {
                        type: 'error',
                        message: `[VSBloom]: No observers were registered for message type ${message.type} in the VSBloom Menu, so an event of this type was missed.`
                    }
                });
            }
        });
    }

    public ObserveBloomToSvelteMessage<MessageType extends BloomToSveltePayload['type']>(messageType: MessageType, observer: BloomToSvelteMessageObserver<MessageType>) {
        let observerList = this.bloomToSvelteMessageObservers.get(messageType);
        if (!observerList) {
            observerList = new Set();
            this.bloomToSvelteMessageObservers.set(messageType, observerList);
        }
        observerList.add(observer as any);
    }

    public RemoveBloomToSvelteMessageObserver<MessageType extends BloomToSveltePayload['type']>(messageType: MessageType, observer: BloomToSvelteMessageObserver<MessageType>) {
        const observerList = this.bloomToSvelteMessageObservers.get(messageType);
        if (observerList) {
            observerList.delete(observer as any);
            if (observerList.size === 0) {
                this.bloomToSvelteMessageObservers.delete(messageType);
            }
        }
    }

    public PostToExtension(payload: SvelteToBloomPayload) {
        this.vscode.postMessage(payload);
    }

    public NotifyUser(type: 'info' | 'warning' | 'error', message: string) {
        this.PostToExtension({
            type: 'send-notification',
            data: {
                type,
                message
            }
        });
    }

    public ChangeTitle(newTitle?: string) {
        this.PostToExtension({
            type: 'change-title',
            data: {
                newTitle
            }
        });
    }

    public GetState() {
        return this.vscode.getState();
    }

    public SetState(state: unknown) {
        this.vscode.setState(state);
    }
}

export const vscode = new VSCodeAPI();
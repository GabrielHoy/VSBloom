/**
 * Implements a set where any value placed inside of it
 * or removed from it causes a callback to be executed to
 * set the context of the given key to said callbacks 
 * return value.
 */

import * as vscode from 'vscode';

type ValidStatefulContextValue = boolean | string | number | null | undefined | vscode.Position | vscode.Range | vscode.Uri | vscode.Location;

export class StatefulVSCodeContext implements vscode.Disposable {
    private ctxSet: Set<string> = new Set();
    private ctxCallback: ((ctxSet: Set<string>) => ValidStatefulContextValue) | null = null;
    private currentCtxValue: ValidStatefulContextValue = null;

    constructor(private ctxKey: string, ctxCallback?:(ctxSet: Set<string>) => ValidStatefulContextValue) {
        this.AssignNewCallback(ctxCallback);
        //On constructor just incase the value was non-null and being set to null,
        //we need to explicitly run the `setContext` command to set it to whatever
        //the callback of the above function returned -- otherwise the context could
        //remain set to a previous value if it had one post-stateful context creation
        //if the `ctxCallback` returns null above.
        vscode.commands.executeCommand('setContext', this.ctxKey, this.currentCtxValue);
    }

    protected ComputeNewContextValue(): void {
        const newCtxValue = this.ctxCallback?.(this.ctxSet) ?? this.ctxSet.size > 0;
        if (newCtxValue !== this.currentCtxValue) {
            vscode.commands.executeCommand('setContext', this.ctxKey, newCtxValue);
            this.currentCtxValue = newCtxValue;
        }
    }

    public AssignNewCallback(newCtxCallback?: (ctxSet: Set<string>) => ValidStatefulContextValue): void {
        this.ctxCallback = newCtxCallback ?? null;

        this.ComputeNewContextValue();
    }

    public Add(ctxKey: string): void {
        this.ctxSet.add(ctxKey);

        this.ComputeNewContextValue();
    }
    
    public Remove(ctxKey: string): void {
        this.ctxSet.delete(ctxKey);

        this.ComputeNewContextValue();
    }

    public Has(ctxKey: string): boolean {
        return this.ctxSet.has(ctxKey);
    }

    public AssignSetPresence(ctxKey: string, shouldBePresent: boolean): void {
        if (shouldBePresent && !this.Has(ctxKey)) {
            this.Add(ctxKey);
        } else if (!shouldBePresent && this.Has(ctxKey)) {
            this.Remove(ctxKey);
        }
    }

    public dispose(): void {
        this.ctxSet.clear();

        this.currentCtxValue = null;
        this.ctxCallback = null;

        vscode.commands.executeCommand('setContext', this.ctxKey, null);
    }
}
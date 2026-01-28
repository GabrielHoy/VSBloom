/**
 * Janitors - VSBloom's Cleanup Utility Library
 * 
 * Handles management and cleanup of general resources
 * that may need to be cleaned up at various points in the
 * lifecycle of VSBloom Client Effects.
 */

function Log(type: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    if (window.__VSBLOOM__) {
        window.__VSBLOOM__.Log(type, message);
    } else {
        console[type](`[VSBloom]: ${message}`);
    }
}

export interface CleanupTask {
    readonly name?: string;
    CleanNow: () => void;
}

export class Janitor {
    private cleanupTasks: Set<CleanupTask> = new Set();
    /**
     * Named cleanup tasks are proxies for unnamed cleanup tasks,
     * and are used to allow 'identifying' cleanup tasks by name,
     * for example to allow for retrieving whether a certain task
     * exists in the cleanup task set, or to retrieve a cleanup
     * task that may have been registered elsewhere in code without
     * needing to extract and maintain a reference to the cleanup task
     * itself.
     */
    private namedCleanupTasks: Map<string, CleanupTask> = new Map();
    private alive = true;

    private _CreateCleanupTask(cleanupFn: () => void, name?: string): CleanupTask {
        if (!this.alive) {
            throw new Error('Attempt to add a cleanup task to a Janitor that is no longer alive');
        }

        const newCleanupTask: CleanupTask = {
            name,
            CleanNow: () => {
                if (!this.cleanupTasks.has(newCleanupTask)) {
                    Log('warn', 'CleanNow was called on a CleanupTask that has already been cleaned or is no longer registered with its Janitor(...or does not belong to this Janitor); this is a no-op and should be avoided for performance sake');
                    return;
                }

                this.cleanupTasks.delete(newCleanupTask);
                cleanupFn();
            }
        };

        this.cleanupTasks.add(newCleanupTask);
        return newCleanupTask;
    }

    public Add(cleanupFn: () => void): CleanupTask {
        return this._CreateCleanupTask(cleanupFn);
    }

    public AddNamed(name: string, cleanupFn: () => void): CleanupTask {
        if (!this.alive) {
            throw new Error('Attempt to add a named cleanup task to a Janitor that is no longer alive');
        }
        const existingNamedCleanupTask = this.namedCleanupTasks.get(name);
        if (existingNamedCleanupTask) {
            throw new Error(`Attempt to add a named cleanup task to a Janitor with a name that is already registered to said Janitor: ${name}`);
        }

        const unnamedCleanupTask: CleanupTask = this._CreateCleanupTask(() => {
            if (this.namedCleanupTasks.get(name) !== unnamedCleanupTask) {
                Log('warn', 'CleanNow was called on a (name-registered) CleanupTask that has already been cleaned or is no longer registered with its Janitor(...or does not belong to this Janitor); this is a no-op and should be avoided for performance sake');
                return;
            }

            this.namedCleanupTasks.delete(name);
            cleanupFn();
        }, name);

        this.namedCleanupTasks.set(name, unnamedCleanupTask);
        return unnamedCleanupTask;
    }

    public GetNamedCleanupTask(name: string): CleanupTask | undefined {
        return this.namedCleanupTasks.get(name);
    }
    
    public CleanItem(cleanupTask: CleanupTask): void {
        if (!this.cleanupTasks.has(cleanupTask)) {
            throw new Error('Attempt to call CleanItem on a Janitor with a CleanupTask that is not registered to said Janitor');
        }

        cleanupTask.CleanNow();
    }

    public RemoveItemWithoutCleanup(cleanupTask: CleanupTask): void {
        if (!this.cleanupTasks.has(cleanupTask)) {
            throw new Error('Attempt to call RemoveItemWithoutCleanup on a Janitor with a CleanupTask that is not registered to said Janitor');
        }

        if (cleanupTask.name) {
            this.namedCleanupTasks.delete(cleanupTask.name);
        }

        this.cleanupTasks.delete(cleanupTask);
    }

    public CleanAll(): void {
        if (!this.alive) {
            throw new Error('Attempt to call CleanAll on a Janitor that is no longer alive');
        }

        for (const cleanupTask of this.cleanupTasks) {
            try {
                cleanupTask.CleanNow();
            } catch (error) {
                Log('error', `An error occurred while invoking a CleanupTask inside of a Janitor's CleanAll method: ${String(error)}`);
            }
        }
    }

    public Destroy(): void {
        if (!this.alive) {
            throw new Error('Attempt to call Destroy on a Janitor that is already destroyed');
        }

        this.CleanAll();
        this.alive = false;
    }
}

export default Janitor;
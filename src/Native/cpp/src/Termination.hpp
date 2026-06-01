/**
 * Native Termination Synchronization
 *
 * Provides declarations for VSBloom's native termination synchronization
 * mechanisms and associated behaviors / utilities.
 */

#pragma once

#include <chrono>
#include <condition_variable>
#include <functional>
#include <iostream>
#include <mutex>
#include <thread>

#ifdef __linux__

    // Linux exposes `prctl` which lets us setup a signal handler for the parent process terminating
    // such that it sends a `SIGTERM` to us when it happens for any reason.
    // The below code for `RegisterParentProcessTerminationCallback` *should* save us in that event
    // regardless, but a one-liner function call is a worthwhile safety net to have in place.
    #include <signal.h>
    #include <sys/prctl.h>

#endif

namespace VSBloom::Termination {

    /**
     * Synchronizes the termination of this runtime's process with the actual
     * parent VSBloom extension host's process which spun us off, such that
     * if the parent process terminates unexpectedly for any reason whatsoever
     * the runtime will invoke the provided callback - said callback should
     * ultimately and speedily exit the runtime's process.
     *
     * This helps facilitate ensuring that the runtime does not continue to run
     * post-termination of the parent process unexpectedly/indefinitely
     * if something were to ever go wrong.
     *
     * @param terminationCallback A callback to invoke when the parent process
     * terminates unexpectedly.
     *
     * @returns `true` if the termination watcher thread was successfully
     * created and spun off - and `false` otherwise.
     */
    inline bool RegisterParentProcessTerminationCallback(const std::function<void()>& runOnTerm) {
        std::mutex              threadSpinoffMutex;
        std::condition_variable threadSpinoffWatcher;
        bool                    watcherThreadRunning = false;

        std::thread terminationWatcherThread(
            [runOnTerm, &threadSpinoffMutex, &threadSpinoffWatcher, &watcherThreadRunning]() -> void {
            char eofBuf[1];

            {
                // Notify main thread that we're up and running
                std::lock_guard<std::mutex> lock(threadSpinoffMutex);
                watcherThreadRunning = true;
            }
            threadSpinoffWatcher.notify_one();

            // Wait for stdin EOF - when the parent pipe closes, we'll assume they've died.
            while (std::cin.read(eofBuf, 1)) {
                std::cout << "Parent process seems to be still alive, received \"" << eofBuf[0] << "\" from stdin."
                          << std::endl;
            }

            std::cout << "Parent process terminated(test?)" << std::endl;
            // Process dead; invoke callback.
            runOnTerm();
        }
        );
        terminationWatcherThread.detach();

        // Wait for the watcher thread to report a successful startup, we'll bail out if it can't do so within a second.
        {
            std::unique_lock<std::mutex> lock(threadSpinoffMutex);
            threadSpinoffWatcher.wait_for(lock, std::chrono::seconds(1), [&watcherThreadRunning] {
                return watcherThreadRunning;
            });
        }

        // If we bailed out above and the watcher thread is still not reporting any
        // success, we'll assume something went wrong with the thread - return false.
        if (!watcherThreadRunning) {
            return false;
        }

        return true;
    }

    inline bool SynchronizeWithParentProcessTermination(const std::function<void()>& runOnTerm) {
#ifdef __linux__
        // If we're on Linux, setup a signal handler for the parent process terminating
        // such that it sends a `SIGTERM` to us when it happens for any reason.
        prctl(PR_SET_PDEATHSIG, SIGTERM);
#endif

        const bool couldRegisterTermCallback =
            VSBloom::Termination::RegisterParentProcessTerminationCallback(runOnTerm);
        if (!couldRegisterTermCallback) {
            return false;
        }

        return true;
    }

} // namespace VSBloom::Termination
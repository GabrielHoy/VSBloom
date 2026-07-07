#include "IPCListener.hpp"
#include <chrono>
#include <condition_variable>
#include <iostream>

#ifdef __linux__

    // Linux exposes `prctl` which lets us setup a signal handler for the parent process terminating
    // such that it sends a `SIGTERM` to us when it happens for any reason.
    // The below code for `RegisterParentProcessTerminationCallback` *should* save us in that event
    // regardless, but a one-liner function call is a worthwhile safety net to have in place.
    #include <signal.h>
    #include <sys/prctl.h>

#endif

namespace VSBloom {

    /**
     * A thread whose responsibility is to watch for the parent process terminating
     * and then invoke the provided callback, in addition to listening for messages
     * from the parent process over stdin and forwarding them to their correct
     * handlers.
     */
    void IPC::IPCListener::IPCListenerThread() {
        std::string message;

        {
            // Notify main thread that we're up and running
            std::lock_guard<std::mutex> lock(ipcThreadSpinoffMutex);
            isIPCThreadRunning = true;
        }
        ipcThreadSpinoffCondition.notify_one();

        // Each newline should delimit the end of a new
        // NDJSON message from the parent process.
        // Additionally, when the parent pipe closes - we'll
        // assume they've died.
        while (std::getline(std::cin, message)) {
            if (!message.empty()) {
                onMessageReceivedCallback(message);
            }
        }

        // Process dead; invoke our termination callback.
        onProcessShutdownCallback();
    }

    /**
     * Synchronizes the termination of this runtime's process with the actual
     * parent VSBloom extension host's process which spun us off, such that
     * if the parent process terminates unexpectedly for any reason whatsoever
     * the runtime will invoke the provided callback - said callback should
     * ultimately and speedily exit the runtime's process.
     * This helps facilitate ensuring that the runtime does not continue to run
     * post-termination of the parent process unexpectedly/indefinitely
     * if something were to ever go wrong.
     *
     * Once that is iniatiated, we begin listening for messages from the
     * parent process over stdin and end up sending any responses that we
     * have to give back to that process through stdout.
     *
     * @param terminationCallback A callback to invoke when the parent process
     * terminates unexpectedly.
     *
     * @returns `true` if the IPC listener thread was successfully
     * created and spun off - and `false` otherwise.
     */
    bool IPC::IPCListener::RunInternalIPCEventLoop() {
        ipcListenerThread = std::thread(&IPCListener::IPCListenerThread, this);

        // Wait for the IPC listener thread to report a successful startup, we'll bail out if it can't do so within
        // a second.
        {
            std::unique_lock<std::mutex> lock(ipcThreadSpinoffMutex);
            ipcThreadSpinoffCondition.wait_for(lock, std::chrono::seconds(1), [this] { return isIPCThreadRunning; });
        }

        // If we bailed out above and the IPC listener thread is still not reporting any
        // success, we'll assume something went wrong with the thread - return false.
        if (!isIPCThreadRunning) {
            return false;
        }

        return true;
    }

    bool IPC::IPCListener::TryIPCBootstrap() {
#ifdef __linux__
        // If we're on Linux, setup a signal handler for the parent process terminating
        // such that it sends a `SIGTERM` to us when it happens for any reason.
        prctl(PR_SET_PDEATHSIG, SIGTERM);
#endif

        const bool isIPCThreadCorrectlyRunning = this->RunInternalIPCEventLoop();
        if (!isIPCThreadCorrectlyRunning) {
            return false;
        }

        return true;
    }

    IPC::IPCListener::IPCListener(
        const std::function<void(const std::string&)>& runOnMessageReceived,
        const std::function<void()>&                   processShutdownHandlerCallback
    )
        : onMessageReceivedCallback(runOnMessageReceived)
        , onProcessShutdownCallback(processShutdownHandlerCallback) {
    }

    IPC::IPCListener::~IPCListener() {
        // Join the IPC listener thread so that
        // we don't leak resources and end up with a
        // thread that is still running post-destruction
        // of this object.
        if (ipcListenerThread.joinable()) {
            ipcListenerThread.join();
        }
        isIPCThreadRunning = false;
    }

} // namespace VSBloom
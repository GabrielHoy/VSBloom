/**
 * Native IPC
 *
 * Provides declarations for VSBloom's native IPC mechanisms
 * and associated behaviors / utilities.
 */

#pragma once

#include <condition_variable>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

namespace VSBloom::IPC {

    class IPCListener {
      private:
        std::function<void(const std::string&)> onMessageReceivedCallback;
        std::function<void()>                   onProcessShutdownCallback;
        std::thread                             ipcListenerThread;
        std::mutex                              ipcThreadSpinoffMutex;
        std::condition_variable                 ipcThreadSpinoffCondition;
        bool                                    isIPCThreadRunning = false;

        void IPCListenerThread();
        bool RunInternalIPCEventLoop();

      public:
        IPCListener(
            const std::function<void(const std::string&)>& runOnMessageReceived,
            const std::function<void()>&                   runOnParentProcessTermination
        );
        ~IPCListener();

        bool TryIPCBootstrap();
    };

} // namespace VSBloom::IPC
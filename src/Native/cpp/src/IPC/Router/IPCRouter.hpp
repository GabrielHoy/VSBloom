/**
 * IPC Router
 *
 * Provides functionality for taking a receieved message
 * string from the parent process and correctly parsing
 * it as NDJSON, then dispatching it to the appropriate
 * handler method inside of a map of IPC method handlers.
 *
 * The IPC Router is additionally responsible for correctly
 * receiving any responses that may be sent back to the router
 * from aforementioned handler methods and then correctly
 * serializing them into a binary NDJSON blob & sending
 * said response back to the parent process over stdout
 * accordingly.
 *
 * The IPC Router is the single point through which all VSBloom
 * Native Runtime IPC traffic should ultimately flow through
 * whether incoming or outgoing, forming a - relatively - high-level
 * full-duplex IPC channel between the parent process and the native runtime.
 *
 */

#pragma once

#include "../Cryptography/IPCCryptography.hpp"
#include "../IPCSendables.hpp"
#include "../Methods/IPCMethods.hpp"
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#if defined(DEBUG_WINDOW_ENABLED)
    #include "Debug/Window/Panels/IPCDebugPanel.hpp"
#endif // defined(DEBUG_WINDOW_ENABLED)

namespace VSBloom::IPC {

    using messageSubmissionCallback_t = std::function<void(const std::string&)>;

    void DefaultMessageSubmissionCallback(const std::string& messageToPush);

    class IPCRouter {
      private:
        static bool                                isSingletonInitialized;
        static methodHandlerMap_t*                 methodRequestHandlers;
        static messageSubmissionCallback_t         messageSubmissionCallback;
        std::mutex                                 messageSubmittingMutex;
        std::optional<Cryptography::EncryptionKey> encryptionKey;

        IPCRouter();

      public:

        /**
         * Gets the singleton instance of the IPCRouter for use in the Native Runtime.
         */
        static IPCRouter& GetInstance() {
            if (!IPCRouter::isSingletonInitialized) {
                throw std::runtime_error("IPCRouter::GetInstance() called before singleton was initialized");
            }

            static IPCRouter instance;

            return instance;
        }

        /**
         * Constructs the IPCRouter singleton instance.
         */
        static void InitializeSingleton(
            methodHandlerMap_t&         methodRequestHandlerMapping,
            messageSubmissionCallback_t messageSubmissionCallbackFunction = DefaultMessageSubmissionCallback
        ) {
            if (IPCRouter::isSingletonInitialized) {
                throw std::runtime_error(
                    "IPCRouter::InitializeSingleton() called again after singleton was already initialized"
                );
            }

            IPCRouter::methodRequestHandlers     = &methodRequestHandlerMapping;
            IPCRouter::messageSubmissionCallback = std::move(messageSubmissionCallbackFunction);

            IPCRouter::isSingletonInitialized = true;
        }

        /**
         * Enables encryption for all subsequent sends and requires all
         * subsequent received messages to be in an encrypted envelope.
         *
         * Keep note that this should be called after sending a valid
         * StartupSuccessMessage carrying the actual encryption key to
         * whatever you want to facilitate encrypted IPC traffic with,
         * otherwise you're essentially locking all future messages with
         * a lock that noone has the key to unlock...and eliminating any
         * way you had of sending them that key.
         */
        void SetEncryptionKey(const Cryptography::EncryptionKey& key);
        bool IsEncryptionKeySet() const noexcept;

        void OnNewMessageReceived(const std::string& message);
        void SendMessage(const IPCSendable& sendableMessage);

#if defined(DEBUG_WINDOW_ENABLED)
        // In DEBUG_WINDOW_ENABLED builds, the IPCDebugPanel needs to
        // be able to reach into the IPCRouter's methodRequestHandlers map
        // and wrap a handler to track its invocations since we don't
        // at the moment have observable signals for things like that.
        friend class Debug::IPCDebugPanel;
#endif // defined(DEBUG_WINDOW_ENABLED)
    };

} // namespace VSBloom::IPC
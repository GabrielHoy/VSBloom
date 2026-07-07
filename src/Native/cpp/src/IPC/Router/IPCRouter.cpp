#include "IPCRouter.hpp"
#include "IPC/Methods/IPCMethods.hpp"
#include <exception>
#include <iostream>

#define MAX_RECEIVED_MESSAGE_PAYLOAD_SIZE_BYTES 1'024 * 1'024 // 1MB

namespace VSBloom::IPC {

    void DefaultMessageSubmissionCallback(const std::string& messageToPush) {
        std::cout << messageToPush << std::endl;
    }

    IPCRouter::IPCRouter(
        const methodHandlerMap_t&         methodRequestHandlerList,
        const messageSubmissionCallback_t customMessageSubmissionCallback
    )
        : methodRequestHandlers(methodRequestHandlerList)
        , messageSubmissionCallback(customMessageSubmissionCallback) {
    }

    IPCRouter::~IPCRouter() {
    }

    void IPCRouter::SetEncryptionKey(const Cryptography::EncryptionKey& key) {
        encryptionKey = key;
    }

    /**
     * Handles a new message received from the parent process.
     * This should be the single point of entry into the program
     * for all messages received which originate from 'elsewhere'.
     *
     * @param message The message to handle.
     */
    void IPCRouter::OnNewMessageReceived(const std::string& message) {
        if (message.size() > MAX_RECEIVED_MESSAGE_PAYLOAD_SIZE_BYTES) {
            std::cerr << "A message was received that was too large to process, skipping..." << std::endl;
            return;
        }

        // Resolve the actual JSON payload we will dispatch; decrypt if a session key is active.
        std::string messageToProcess;

        if (encryptionKey.has_value()) {
            if (!nlohmann::json::accept(message)) {
                std::cerr << "Received non-JSON encrypted envelope, skipping..." << std::endl;
                return;
            }
            const json_t outer = nlohmann::json::parse(message);
            if (!outer.contains("enc") || !outer["enc"].is_string()) {
                std::cerr << "Received unencrypted message after session key was established, rejecting..."
                          << std::endl;
                return;
            }

            std::string encMsgStr = outer["enc"].get<std::string>();
// If the program was build in debug mode,
// accept non-encrypted NDJSON messages:
// these will have a `_dbg` key present.
#ifdef DEBUG
            if (outer.contains("_dbg")) {
                auto b64DecodedMsg = Cryptography::Base64::Decode(encMsgStr);
                if (!b64DecodedMsg.has_value()) {
                    std::cerr << "Failed to decode base64 _dbg message, skipping..." << std::endl;
                    return;
                }

                messageToProcess = std::string(b64DecodedMsg->begin(), b64DecodedMsg->end());
            }
#endif

            // If the message didn't get pre-set from the above debug block,
            // attempt to decrypt it using the session key.
            if (messageToProcess.empty()) {
                std::optional<std::string> decrypted = Cryptography::Decrypt(*encryptionKey, encMsgStr);
                if (!decrypted.has_value()) {
                    std::cerr << "Message decryption failed (auth tag mismatch or malformed input), rejecting..."
                              << std::endl;
                    return;
                }
                messageToProcess = std::move(*decrypted);
            }
        } else {
            messageToProcess = message;
        }

        bool isValidJSONMessage = nlohmann::json::accept(messageToProcess);
        if (!isValidJSONMessage) {
            std::cerr << "A message was received that was not valid JSON, skipping..." << std::endl;
            return;
        }

        // We should be safe to actually parse the NDJSON now.
        json_t parsedMessage = nlohmann::json::parse(messageToProcess);

        // Now onto payload validation itself, since we have an object at this point:
        // Every message we get should always have a `type` key to identify its structure.
        if (!parsedMessage.contains("type")) {
            std::cerr << "A message was received that did not contain a 'type' key, skipping..." << std::endl;
            return;
        }

        const methodName_t messageType = parsedMessage["type"].get<methodName_t>();
        if (!methodRequestHandlers.contains(messageType)) {
            std::cerr
                << "A message was received with a message type that does not have a corresponding native IPC handler registered for it: "
                << messageType << ", skipping..." << std::endl;
            return;
        }

        // Awesome, we've properly validated that a reference to the handler function
        // exists that we need to invoke with the message payload to actually *do* what
        // the message wants done.
        const methodHandler_t handler = methodRequestHandlers.at(messageType);

        // Only last thing to verify is the message payload containing a 'data' key of an
        // object type, so we know that we have *something* to actually invoke our handler with.
        if (!parsedMessage.contains("data") || parsedMessage["data"].type() != nlohmann::json::value_t::object) {
            std::cerr << "A message was received that did not contain a 'data' object, skipping..." << std::endl;
            return;
        }

        // Go ahead and invoke the handler with our message payload; keep note of its return
        try {
            const methodResponse_t handlerInvocationResponse = handler(parsedMessage["data"]);
            if (!handlerInvocationResponse.has_value()) {
                // OK, the function returned an `std::nullopt` value so the optional return is
                // empty: We have nothing left to do here for now.
                return;
            }

            // If we're here, the function's handler returned some JSON object that we need to
            // marshal along into the SendMessage() method to be sent back to the parent process.
            SendMessage(handlerInvocationResponse.value());
        } catch (const std::exception& e) {
            // Oof. Something went wrong with the handler invocation.
            // Let's send a message back to the parent process to describe the error.
            const MethodExceptionRaisedMessage exceptionMsg{messageType, e};

            SendMessage(exceptionMsg);
        }
    }

    /**
     * Sends a message to the parent process.
     *
     * Said message must be a valid IPCSendable, though no other
     * assumptions are made as to its structure or contents.
     *
     * @param sendableMessage The message to send to the parent process.
     */
    void IPCRouter::SendMessage(const IPCSendable& sendableMessage) {
        // Is the message generally something that fits the rough
        // contract of an IPCSendable?
        if (!sendableMessage.payload.contains("type")
            || sendableMessage.payload["type"].type_name() != std::string("string")) {
            std::cerr << "Attempted to send a message that did not contain a 'type' key, skipping...Type: "
                      << std::endl;
            return;
        }

        const std::string serializedPayload = sendableMessage.payload.dump(-1);

        std::string wireMessage;
        if (encryptionKey.has_value()) {
            const std::string encryptedBlob = Cryptography::Encrypt(*encryptionKey, serializedPayload);
            wireMessage                     = json_t({{"enc", encryptedBlob}}).dump(-1);
        } else {
            wireMessage = serializedPayload;
        }

        // Lock our message submission mutex and invoke the submission callback with the message we
        // want to send 'down the wire'
        std::lock_guard<std::mutex> msgSubmissionLock(messageSubmittingMutex);
        messageSubmissionCallback(wireMessage);
    }

} // namespace VSBloom::IPC
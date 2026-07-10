/**
 * IPC-Sendable Message Contracts
 *
 * Defines concept-constrained contracts for all messages the VSBloom
 * Native Runtime can send to the parent process.
 *
 * Base IPCSendable message format:
 *   Messages: { "type": "<message_type>", "data": { ...messageFields } }
 */

#pragma once

#include "Audio/Device/AudioDevice.hpp"
#include <nlohmann/json.hpp>
#include <string>
#include <string_view>

namespace VSBloom::IPC {

    using json_t = nlohmann::json;

    /**
     * A concept representing the minimum structural requirements
     * for a given type to be considered a valid IPCSendable message.
     */
    template <typename T>
    concept IsConceptuallySendableMessage = requires(const T& t) {
        { T::name } -> std::convertible_to<std::string_view>;
        { t.DataToJSON() } -> std::same_as<json_t>;
    };

    /**
     * A type-erased general wrapper around a JSON object that
     * can be sent over the IPC channel to the process host as a message
     * via passing one of these to IPCRouter::SendMessage.
     */
    struct IPCSendable {
        const nlohmann::json payload;

        // For the actual JSON data that `msg.DataToJSON()` returns, we further
        // encapsulate it in a top-level JSON object including a `type` field
        // specifying the actual type of the message so that TypeScript can
        // correctly parse and specialize type interfaces / intellisense from it.
        // This payload ends up looking something like:
        // ```json
        // {
        //      "type": "xyz",
        //      "data": {
        //          ...msg.DataToJSON()
        //      }
        // }
        // ```

        // This constructor is a bit of a mess, all we're doing here is
        // constructing the IPCSendable payload object that will be sent
        // to the parent process with an immediately-invoked lambda so that
        // we can actually run complex logic to construct it without having
        // to declare `payload` as a non-const reference.
        // The lambda just produces the above JSON structure that we need,
        // though with the `data` field potentially being omitted entirely
        // if the message's DataToJSON() method returns an empty JSON object.
        template <IsConceptuallySendableMessage T>
        IPCSendable(const T& msg) noexcept
            : payload({{"type", T::name}, {"data", [&msg]() -> std::optional<nlohmann::json> {
                                               const json_t dataToSend = msg.DataToJSON();
                                               if (!dataToSend.empty()) {
                                                   return std::make_optional(dataToSend);
                                               } else {
                                                   return std::nullopt;
                                               }
                                           }()}}) {
        }
    };

    /**
     * A message sent in place of an intended response to the
     * parent process when a method invocation on the Native Runtime
     * should normally return a response back to the parent process,
     * but when for some reason the method handler cannot perform its
     * intended function and/or receives invalid input data for its
     * operation to succeed in some way.
     */
    struct MethodExceptionRaisedMessage {
        static constexpr const char* name = "method-exception";
        const std::string_view       methodThatThrew;
        const std::exception&        exceptionThrown;

        json_t DataToJSON() const noexcept {
            return {{"methodThatThrew", methodThatThrew}, {"exceptionThrown", std::string(exceptionThrown.what())}};
        }
    };

    static_assert(IsConceptuallySendableMessage<MethodExceptionRaisedMessage>);

    /**
     * A message sent upon the Native Runtime's successful, full
     * initialization and startup.
     *
     * Carries with it a hex-encoded AES-256 encryption key for which,
     * after receiving it, both sides of the IPC channel *must* utilize
     * to encrypt/authenticate all subsequent IPC messages.
     * This is admittedly probably over-protective to a certain degree,
     * but it's better than some malicious actor with potentially
     * elevated access to the IPC channel being able to MITM our
     * traffic and send us - or the parent process - malicious requests.
     */
    struct StartupSuccessMessage {
        static constexpr const char* name = "i-am-alive";
        const std::string            encryptionKey;

        json_t DataToJSON() const noexcept {
            return {{"encryptionKey", encryptionKey}};
        }
    };

    static_assert(IsConceptuallySendableMessage<StartupSuccessMessage>);

    struct SecureAcknowledgementMessage {
        static constexpr const char* name = "secure-acknowledgement";
        const std::string            acknowledgement;

        json_t DataToJSON() const noexcept {
            return {{"acknowledgement", acknowledgement}};
        }
    };

    static_assert(IsConceptuallySendableMessage<SecureAcknowledgementMessage>);

    struct DebugOutputMessage {
        static constexpr const char* name = "debug-output";
        const json_t                 dbgOutput;

        json_t DataToJSON() const noexcept {
            return {{"message", dbgOutput.dump()}};
        }
    };

    static_assert(IsConceptuallySendableMessage<DebugOutputMessage>);

    struct AudioDeviceEnumerationMessage {
        static constexpr const char*                   name = "audio-device-enumeration";
        const std::vector<VSBloom::Audio::AudioDevice> devices;

        json_t DataToJSON() const noexcept {
            json_t audioDeviceList = json_t::array();
            for (const VSBloom::Audio::AudioDevice& device : devices) {
                audioDeviceList.push_back(device.ToJSON());
            }

            return {{"devices", audioDeviceList}};
        }
    };

    static_assert(IsConceptuallySendableMessage<AudioDeviceEnumerationMessage>);

} // namespace VSBloom::IPC

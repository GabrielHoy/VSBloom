#include "IPCMethods.hpp"
#include "Audio/Device/AudioDevice.hpp"
#include "Audio/Device/DeviceEnumeration.hpp"
#include "IPC/IPCSendables.hpp"
#include "State/AudioCaptureState.hpp"
#include <iostream>
#ifdef DEBUG
    #include "Debug/DebugCallable.hpp"
#endif

/**
 * Helper macro to expand a method's name to the key-value
 * pair syntax that is required for each entry inside of
 * the `methodHandlerMap_t` map in a slightly more identifiable
 * manner than just an object with a string literal and method
 * reference.
 */
#define EXPOSE_METHOD(ipcMethodName, handlerName) {ipcMethodName, handlerName}

namespace VSBloom::IPC {

    /*
    A method handler skeleton looks something along the lines of:
    ```cpp
        methodResponse_t OnHelloInvoked(const methodRequest_t& message) {
            bool hasNameField = message.contains("name");
            std::cerr << "Hello method invoked: "
                    << (hasNameField ? message.at("name").get<std::string>() : "<no name provided>") << std::endl;

            const TestResponseMessage acknowledgement{"hi there!", rand() % 100};
            return acknowledgement;
        }
    ```
    */

    /*
        Fired after AES-256-GCM encryption is established between the parent process and the Native Runtime,
        used to ensure that we're in sync, encryption-wise.
    */
    SecureAcknowledgementMessage OnTestSecureMessageInvoked(const methodRequest_t& message) {
        if (message.at("message").type() != nlohmann::json::value_t::string) {
            std::cerr << "Test secure message method invoked without a valid string 'message' field" << std::endl;
            throw std::invalid_argument("Test secure message method invoked without a valid string 'message' field");
        }
        const std::string stringifiedMessage = std::string("echo: ") + message.value("message", "");

        return SecureAcknowledgementMessage{stringifiedMessage};
    }

    /* Only available in DEBUG builds, used to kick off general volatile debugging functionality */
    std::optional<DebugOutputMessage> OnDebugTestMessageInvoked(const methodRequest_t& message) {
#ifdef DEBUG
        DebugCallable(message);
        return std::nullopt;
#else
        // `message` only feeds DebugCallable, which isn't compiled in here; discard
        // it explicitly so Release doesn't trip `-Wunused-parameter` under `/WX`.
        static_cast<void>(message);
        return DebugOutputMessage{
            {{"invalid_invocation",
              "The VSBloom Native Runtime was not built in DEBUG mode. You cannot use DebugTestMessage in Release builds."}}
        };
#endif
    }

    /* Returns the list of all available audio devices to the caller */
    AvailableAudioDeviceListMessage OnGetAvailableAudioDevicesInvoked(const methodRequest_t& /*unused*/) {
        const std::vector<VSBloom::Audio::AudioDevice> curDevices = VSBloom::Audio::EnumerateAudioDevices();

        return AvailableAudioDeviceListMessage{curDevices};
    }

    /*
        Assigns a list of audio devices to be captured by the Native Runtime,
        this is the point where audio stream data would start being captured,
        anylyzed, and sent back to the caller asynchronously via the functionality
        inside of AudioCaptureState.

        **firing this with an empty list will stop all audio capture / analysis.**
    */
    CurrentlyCapturedAudioDeviceListMessage OnSetCurrentlyCapturedAudioDevicesInvoked(const methodRequest_t& message) {
        if (message.at("devices").type() != nlohmann::json::value_t::array) {
            const std::string invalidDevicesArrayErr =
                "SetCurrentlyCapturedAudioDevices method invoked without a valid array-based 'devices' field";
            std::cerr << invalidDevicesArrayErr << std::endl;
            throw std::invalid_argument(invalidDevicesArrayErr);
        }

        for (const auto& deviceId : message.at("devices")) {
            if (deviceId.type() != nlohmann::json::value_t::string) {
                const std::string invalidDeviceIdErr =
                    "SetCurrentlyCapturedAudioDevices method invoked with a non-string device ID";
                std::cerr << invalidDeviceIdErr << std::endl;
                throw std::invalid_argument(invalidDeviceIdErr);
            }
        }

        const std::vector<std::string> deviceIdsToCapture = message.at("devices").get<std::vector<std::string>>();

        // Deliberately not an echo of the request - what comes back is what is
        // *actually* being captured, which may be a subset if a device was malformed
        // or failed to open. The caller can diff it against what it asked for.
        return CurrentlyCapturedAudioDeviceListMessage{
            State::AudioCaptureState::SetCurrentlyCapturedDeviceIds(deviceIdsToCapture)
        };
    }

    /* Reports which audio devices are currently being captured, without changing them */
    CurrentlyCapturedAudioDeviceListMessage
    OnGetCurrentlyCapturedAudioDevicesInvoked(const methodRequest_t& /*unused*/) {
        return CurrentlyCapturedAudioDeviceListMessage{State::AudioCaptureState::GetCurrentlyCapturedDeviceIds()};
    }

    methodHandlerMap_t methodRequestHandlers = {
        EXPOSE_METHOD("test-secure-message", OnTestSecureMessageInvoked),
        EXPOSE_METHOD("debug-test-message", OnDebugTestMessageInvoked),
        EXPOSE_METHOD("get-available-audio-devices", OnGetAvailableAudioDevicesInvoked),
        EXPOSE_METHOD("set-currently-captured-audio-devices", OnSetCurrentlyCapturedAudioDevicesInvoked),
        EXPOSE_METHOD("get-currently-captured-audio-devices", OnGetCurrentlyCapturedAudioDevicesInvoked),
    };

} // namespace VSBloom::IPC

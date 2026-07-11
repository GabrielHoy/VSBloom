#include "IPCMethods.hpp"
#include "Audio/Device/AudioDevice.hpp"
#include "Audio/Device/DeviceEnumeration.hpp"
#include "IPC/IPCSendables.hpp"
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

    SecureAcknowledgementMessage OnTestSecureMessageInvoked(const methodRequest_t& message) {
        if (message.at("message").type() != nlohmann::json::value_t::string) {
            std::cerr << "Test secure message method invoked without a valid string 'message' field" << std::endl;
            throw std::invalid_argument("Test secure message method invoked without a valid string 'message' field");
        }
        const std::string stringifiedMessage = std::string("echo: ") + message.value("message", "");

        return SecureAcknowledgementMessage{stringifiedMessage};
    }

    std::optional<DebugOutputMessage> OnDebugTestMessageInvoked(const methodRequest_t& message) {
#ifdef DEBUG
        DebugCallable(message);
        return std::nullopt;
#else
        return DebugOutputMessage{
            {{"invalid_invocation",
              "The VSBloom Native Host was not built in DEBUG mode. You cannot use DebugTestMessage in Release builds."}}
        };
#endif
    }

    AvailableAudioDeviceListMessage OnGetAvailableAudioDevicesInvoked(const methodRequest_t&) {
        const std::vector<VSBloom::Audio::AudioDevice> curDevices = VSBloom::Audio::EnumerateAudioDevices();

        return AvailableAudioDeviceListMessage{curDevices};
    }

    methodHandlerMap_t methodRequestHandlers = {
        EXPOSE_METHOD("test-secure-message", OnTestSecureMessageInvoked),
        EXPOSE_METHOD("debug-test-message", OnDebugTestMessageInvoked),
        EXPOSE_METHOD("get-available-audio-devices", OnGetAvailableAudioDevicesInvoked),
    };

} // namespace VSBloom::IPC

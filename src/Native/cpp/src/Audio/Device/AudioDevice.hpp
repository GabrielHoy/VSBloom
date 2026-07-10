/**
 * Provides a platform-agnostic audio 'device' implementation.
 */
#pragma once

#include <nlohmann/json.hpp>
#include <string>

namespace VSBloom::Audio {

    /**
     * Describes whether an audio device is one that "renders" audio,
     * outputting it(i.e speakers etc.) or whether it "captures" audio,
     * taking it as input(i.e microphones etc.) - loosely mirrors WASAPI's
     * `EDataFlow`.
     */
    enum class DeviceDataFlowType {
        Render,
        Capture,
    };

    inline const char* DeviceDataFlowTypeToString(DeviceDataFlowType dataFlowType) noexcept {
        switch (dataFlowType) {
            case DeviceDataFlowType::Render:
                return "render";
            case DeviceDataFlowType::Capture:
                return "capture";
        }
        return "unknown";
    }

    /**
     * A platform-agnostic representation of a single audio device, as
     * enumerated by whatever native audio backend is currently active.
     *
     * `id` should NOT be treated as persistent across reboots or device
     * reconnections.
     */
    struct AudioDevice {
        std::string        id;
        std::string        name;
        DeviceDataFlowType dataFlow;
        bool               isDefault;

        nlohmann::json ToJSON() const noexcept {
            return {
                {"id", id},
                {"name", name},
                {"dataFlow", DeviceDataFlowTypeToString(dataFlow)},
                {"isDefault", isDefault},
            };
        }
    };

} // namespace VSBloom::Audio

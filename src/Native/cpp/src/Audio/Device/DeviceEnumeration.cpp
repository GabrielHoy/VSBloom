/**
 * Audio Device Enumeration
 *
 * Implements `VSBloom::Audio::EnumerateAudioDevices()` on top of miniaudio
 */
#include "DeviceEnumeration.hpp"
#include "DeviceId.hpp"
#include "miniaudio.h"
#include <stdexcept>

namespace VSBloom::Audio {

    namespace {

        AudioDevice ToAudioDevice(const ma_device_info& info, DeviceDataFlowType deviceDataFlowType) {
            return AudioDevice{
                .id        = DeviceIdToHex(info.id),
                .name      = std::string(info.name),
                .dataFlow  = deviceDataFlowType,
                .isDefault = info.isDefault != 0,
            };
        }

    } // namespace

    std::vector<AudioDevice> EnumerateAudioDevices() {
        ma_context context;
        if (ma_context_init(nullptr, 0, nullptr, &context) != MA_SUCCESS) {
            throw std::runtime_error("Failed to initialize the miniaudio context");
        }

        ma_device_info* playbackInfos = nullptr;
        ma_uint32       playbackCount = 0;
        ma_device_info* captureInfos  = nullptr;
        ma_uint32       captureCount  = 0;

        const ma_result result =
            ma_context_get_devices(&context, &playbackInfos, &playbackCount, &captureInfos, &captureCount);
        if (result != MA_SUCCESS) {
            ma_context_uninit(&context);
            throw std::runtime_error("Failed to enumerate audio devices via miniaudio");
        }

        std::vector<AudioDevice> devices;
        devices.reserve(playbackCount);

        // We only surface *playback* (render) devices right now - the sole
        // consumer of this data is loopback capture, which captures
        // whatever a playback device is currently outputting, not a
        // standalone capture (microphone/line-in) device. `playbackInfos`/
        // `captureInfos` point into the context's own internal buffers, so
        // we must finish copying everything we need out of them before
        // `ma_context_uninit()` invalidates them.
        for (ma_uint32 i = 0; i < playbackCount; ++i) {
            devices.push_back(ToAudioDevice(playbackInfos[i], DeviceDataFlowType::Render));
        }

        ma_context_uninit(&context);
        return devices;
    }

} // namespace VSBloom::Audio

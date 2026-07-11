#include "MonitorSourceResolver.hpp"

#if defined(VSBLOOM_AUDIO_BACKEND_PULSEAUDIO)

    #include <stdexcept>
    #include <string>

namespace VSBloom::Audio {

    ma_device_id ResolveMonitorSourceForPlaybackDevice(const ma_device_id& playbackDeviceId) {
        // `id.pulse` is the raw PulseAudio object name, not a
        // human-readable description - every sink is guaranteed by
        // PulseAudio's own architecture to have a monitor source named
        // "<sink-name>.monitor" though, so this shouldn't be a fragile heuristic.
        const std::string monitorSourceName = std::string(playbackDeviceId.pulse) + ".monitor";

        ma_context context;
        if (ma_context_init(nullptr, 0, nullptr, &context) != MA_SUCCESS) {
            throw std::runtime_error("Failed to initialize the miniaudio context while resolving a monitor source");
        }

        ma_device_info* playbackInfos = nullptr;
        ma_uint32       playbackCount = 0;
        ma_device_info* captureInfos  = nullptr;
        ma_uint32       captureCount  = 0;

        const ma_result result =
            ma_context_get_devices(&context, &playbackInfos, &playbackCount, &captureInfos, &captureCount);
        if (result != MA_SUCCESS) {
            ma_context_uninit(&context);
            throw std::runtime_error("Failed to enumerate capture devices while resolving a monitor source");
        }

        for (ma_uint32 i = 0; i < captureCount; ++i) {
            if (monitorSourceName == captureInfos[i].id.pulse) {
                const ma_device_id resolved = captureInfos[i].id; // plain struct copy, safe past context teardown
                ma_context_uninit(&context);
                return resolved;
            }
        }

        ma_context_uninit(&context);
        throw std::runtime_error("No PulseAudio monitor source found for the requested playback device");
    }

} // namespace VSBloom::Audio

#endif // VSBLOOM_AUDIO_BACKEND_PULSEAUDIO

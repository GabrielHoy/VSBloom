#include "CaptureSession.hpp"
#include <stdexcept>

#if defined(VSBLOOM_AUDIO_BACKEND_PULSEAUDIO)
    #include "Device/PulseAudio/MonitorSourceResolver.hpp"
#endif

namespace VSBloom::Audio {

    CaptureSession::CaptureSession(const ma_device_id& deviceId) {
#if defined(VSBLOOM_AUDIO_BACKEND_PULSEAUDIO)
        // No WASAPI-style loopback mode exists on PulseAudio, so instead
        // we'll resolve the chosen playback (sink) device to its ".monitor"
        // source and open that as an ordinary capture device instead.
        // `resolvedDeviceId` must outlive `ma_device_init` below, same
        // lifetime rule as `deviceId` on the WASAPI path.
        const ma_device_id resolvedDeviceId = ResolveMonitorSourceForPlaybackDevice(deviceId);
        ma_device_config   config           = ma_device_config_init(ma_device_type_capture);
        config.capture.pDeviceID            = &resolvedDeviceId;
#else
        ma_device_config config = ma_device_config_init(ma_device_type_loopback);
        // `pDeviceID` only needs to stay valid for the duration of
        // `ma_device_init` below - it gets copied into the device's own
        // descriptor internally, not retained by pointer!
        config.capture.pDeviceID = &deviceId;
#endif
        config.capture.format   = ma_format_f32;
        config.capture.channels = ANALYSIS_CHANNELS;
        config.sampleRate       = ANALYSIS_SAMPLE_RATE;
        config.dataCallback     = &CaptureSession::InternalProcessDataCallback;
        config.pUserData        = this;

        if (ma_device_init(nullptr, &config, &device) != MA_SUCCESS) {
            throw std::runtime_error("Failed to initialize a loopback capture device");
        }

        if (ma_device_start(&device) != MA_SUCCESS) {
            ma_device_uninit(&device);
            throw std::runtime_error("Failed to start a loopback capture device");
        }
    }

    CaptureSession::~CaptureSession() {
        // (Safe to call from a thread other than the capture callback
        // thread - ma_device_stop() blocks until that thread actually
        // terminates, so ma_device_uninit() right after is guaranteed not
        // to have a callback still in flight)
        ma_device_stop(&device);
        ma_device_uninit(&device);
    }

    AnalyzedAudioFrame CaptureSession::GetLatestAnalysisSnapshot() const {
        std::lock_guard<std::mutex> lock(snapshotMutex);
        return latestSnapshot;
    }

    void CaptureSession::InternalProcessDataCallback(
        ma_device* device,
        void* /*output*/,
        const void* input,
        ma_uint32   frameCount
    ) {
        auto* self = static_cast<CaptureSession*>(device->pUserData);
        self->OnAudioData(static_cast<const float*>(input), frameCount);
    }

    void CaptureSession::OnAudioData(const float* samples, ma_uint32 frameCount) {
        // most calls here won't produce a fresh snapshot,
        // since WASAPI callback sizes don't line up with the analysis
        // frame size. When `AccumulateSamples` returns true, a new analysis frame gets produced.
        if (analyzer.AccumulateSamples(samples, frameCount)) {
            // TODO: Could make this a little better by only actually producing a snapshot
            //  when we need it instead of every time there's enough samples for an analysis frame.
            AnalyzedAudioFrame freshSnapshot;
            analyzer.ProduceAnalysisFrame(freshSnapshot);
            {
                std::lock_guard<std::mutex> lock(snapshotMutex);
                latestSnapshot = std::move(freshSnapshot); // Atomic update of the latest snapshot
            }
        }
    }

} // namespace VSBloom::Audio

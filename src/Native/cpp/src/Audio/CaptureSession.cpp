#include "CaptureSession.hpp"
#include <cmath>
#include <stdexcept>

namespace VSBloom::Audio {

    CaptureSession::CaptureSession(const ma_device_id& deviceId) {
        ma_device_config config = ma_device_config_init(ma_device_type_loopback);
        // `pDeviceID` only needs to stay valid for the duration of
        // `ma_device_init` below - it gets copied into the device's own
        // descriptor internally, not retained by pointer!
        config.capture.pDeviceID = &deviceId;
        config.capture.format    = ma_format_f32;
        config.capture.channels  = ANALYSIS_CHANNELS;
        config.sampleRate        = ANALYSIS_SAMPLE_RATE;
        config.dataCallback      = &CaptureSession::InternalProcessDataCallback;
        config.pUserData         = this;

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

    AudioAnalysisSnapshot CaptureSession::GetLatestAnalysisSnapshot() const {
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
        // TODO: Placeholder analysis; just RMS amplitude over this callback's
        // samples. Real FFT analysis (bin computation) slots in here later.
        // The `fftBins` field will stay zeroed until that point.
        float sumSquares = 0.0f;
        for (ma_uint32 i = 0; i < frameCount; ++i) {
            sumSquares += samples[i] * samples[i];
        }
        const float rms = frameCount > 0 ? std::sqrt(sumSquares / static_cast<float>(frameCount)) : 0.0f;

        std::lock_guard<std::mutex> lock(snapshotMutex);
        latestSnapshot.avgAmplitude = rms;
    }

} // namespace VSBloom::Audio

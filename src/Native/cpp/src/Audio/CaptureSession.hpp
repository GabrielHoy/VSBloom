/**
 * Loopback Capture Session
 *
 * Owns a single miniaudio loopback-capture device for one render (output)
 * device, and continuously updates the latest computed
 * `AudioAnalysisSnapshot` for the aggregator thread (see CaptureManager)
 * to read.
 *
 * All capture happens on miniaudio's own internal device thread; the only
 * cross-thread contact point is `GetLatestSnapshot()`, which takes a
 * short-lived lock to copy out the latest published snapshot rather than
 * ever blocking the capture thread on IPC/aggregation work.
 */
#pragma once

#include "miniaudio.h"
#include <cstddef>
#include <mutex>
#include <vector>

namespace VSBloom::Audio {

    // Miniaudio's data conversion pipeline hamples resampling/downmixing
    // behind the scenes so our lives tend to be much easier when attempting
    // to work with audio data in the below formats
    constexpr ma_uint32   ANALYSIS_SAMPLE_RATE   = 48'000;
    constexpr ma_uint32   ANALYSIS_CHANNELS      = 1;
    constexpr std::size_t ANALYSIS_FFT_BIN_COUNT = 32; // placeholder until real FFT analysis lands

    /**
     * A 'snapshot' of the analyzed audio data at a given point in time.
     *
     * TODO: `fftBins` is left zeroed for now - see `CaptureSession::OnAudioData`
     * for the placeholder analysis this currently runs instead of a real
     * FFT.
     */
    struct AudioAnalysisSnapshot {
        std::vector<float> fftBins      = std::vector<float>(ANALYSIS_FFT_BIN_COUNT, 0.0f);
        float              avgAmplitude = 0.0f;
    };

    class CaptureSession {
      public:
        /**
         * Immediately initializes and starts loopback capture on the given
         * 'render' device.
         *
         * @throws std::runtime_error if the device fails to open for
         * capture (e.g. disappeared between enumeration and this call).
         */
        explicit CaptureSession(const ma_device_id& deviceId);
        ~CaptureSession();

        CaptureSession(const CaptureSession&)            = delete;
        CaptureSession& operator=(const CaptureSession&) = delete;

        AudioAnalysisSnapshot GetLatestAnalysisSnapshot() const;

      private:
        static void
             InternalProcessDataCallback(ma_device* device, void* output, const void* input, ma_uint32 frameCount);
        void OnAudioData(const float* samples, ma_uint32 frameCount);

        ma_device             device{};
        mutable std::mutex    snapshotMutex;
        AudioAnalysisSnapshot latestSnapshot;
    };

} // namespace VSBloom::Audio

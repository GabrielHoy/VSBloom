/**
 * Loopback Capture Session
 *
 * Owns a single miniaudio loopback-capture device for one render (output)
 * device, and continuously updates the latest computed
 * `AnalyzedAudioFrame` (see AudioAnalyzer.hpp) for the aggregator
 * thread (see CaptureManager) to read.
 *
 * All capture happens on miniaudio's own internal device thread; the only
 * cross-thread contact point is `GetLatestAnalysisSnapshot()`, which takes
 * a short-lived lock to copy out the latest published snapshot rather than
 * ever blocking the capture thread on IPC/aggregation work. The actual DSP
 * work lives entirely in `AudioAnalyzer` - this class's job is audio I/O
 * and cross-thread publishing, not signal processing shenanigans.
 */
#pragma once

#include "AudioAnalyzer.hpp"
#include "miniaudio.h"
#include <mutex>

namespace VSBloom::Audio {

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

        AnalyzedAudioFrame GetLatestAnalysisSnapshot() const;

      private:
        static void
             InternalProcessDataCallback(ma_device* device, void* output, const void* input, ma_uint32 frameCount);
        void OnAudioData(const float* samples, ma_uint32 frameCount);

        ma_device          device{};
        AudioAnalyzer      analyzer;
        mutable std::mutex snapshotMutex;
        AnalyzedAudioFrame latestSnapshot;
    };

} // namespace VSBloom::Audio

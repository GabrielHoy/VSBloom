/**
 * Audio Analyzer
 *
 * This class is where the actual DSP happens on captured audio.
 * Turns a stream of raw mono PCM samples into periodic frequency-domain
 * snapshots, via a windowed real FFT implementation (pffft).
 *
 * Intended to be managed by `CaptureSession`
 *
 * (Not thread-safe; things like `AccumulateSamples`/`ProduceAnalysisFrame`
 * are only expected to be actually called by miniaudio's capture callback
 * thread.)
 */
#pragma once

#include "FFTWindowing.hpp"
#include <array>
#include <cstddef>
#include <vector>

struct PFFFT_Setup; // only AudioAnalyzer.cpp needs pffft.h itself; this can remain opaque in header land

namespace VSBloom::Audio {

    // Miniaudio's data conversion pipeline handles resampling/downmixing
    // behind the scenes so our lives tend to be much easier when attempting
    // to work with audio data in the below formats
    constexpr unsigned int               ANALYSIS_SAMPLE_RATE   = 48'000;
    constexpr unsigned int               ANALYSIS_CHANNELS      = 1;
    constexpr std::size_t                ANALYSIS_FFT_BIN_COUNT = 64;
    // Each call to `ProduceAnalysisFrame` consumes `FFT_HOP_SIZE` samples,
    // leaving the remaining `FFT_FRAME_SIZE - FFT_HOP_SIZE` samples buffered
    // and ready to be reused as the start of the next analysis window.
    constexpr std::size_t                FFT_FRAME_SIZE = 4'096;
    constexpr std::size_t                FFT_HOP_SIZE   = 512;
    inline const FFTWindowing::FFTWindow FFT_WINDOW     = FFTWindowing::BlackmanHarris<FFT_FRAME_SIZE>();

    struct AnalyzedAudioFrame {
        std::array<float, ANALYSIS_FFT_BIN_COUNT> fftBins      = std::array<float, ANALYSIS_FFT_BIN_COUNT>{0.0f};
        float                                     avgAmplitude = 0.0f;
    };

    class AudioAnalyzer {
      public:
        /**
         * @throws std::runtime_error if pffft setup or aligned buffer
         * allocation fails for some reason.
         */
        AudioAnalyzer();
        ~AudioAnalyzer();

        AudioAnalyzer(const AudioAnalyzer&)            = delete;
        AudioAnalyzer& operator=(const AudioAnalyzer&) = delete;

        /**
         * Feeds newly-captured mono PCM samples in. An internal accumulator
         * buffers samples until a full analysis window is available,
         * at which point `ProduceAnalysisFrame` should be called.
         *
         * @returns true if enough samples have been accumulated to produce an analysis frame.
         */
        bool AccumulateSamples(const float* samples, std::size_t sampleCount);
        /**
         * Checks if the accumulator has enough samples to produce an analysis frame.
         *
         * @returns true if enough samples are available, false otherwise.
         */
        bool HasEnoughSamplesForAnalysis() const;
        /**
         * Produces a new analysis frame from the oldest `FFT_FRAME_SIZE`
         * accumulated samples, then advances the window by consuming
         * `FFT_HOP_SIZE` samples.
         *
         * Assumes that enough samples have *actually* been accumulated for an analysis frame to be produced,
         * **UB if this is not the case.**
         */
        void ProduceAnalysisFrame(AnalyzedAudioFrame& outSnapshot);

        template <typename NUM_T>
            requires std::is_floating_point_v<NUM_T>
        inline static NUM_T LinearToDBSpace(NUM_T linearValue) {
            static constexpr NUM_T dbEpsilon = 1e-6;
            return 20.0 * std::log10(std::max(linearValue, dbEpsilon));
        }

      private:
        // Escape hatch for `AccumulateSamples`: if the accumulator ever
        // grows past this, it gets hard-trimmed back down to
        // `FFT_FRAME_SIZE` sacrificing overlap continuity for a single
        // event in exchange for bounded memory and...not slowly grinding
        // through increasingly stale audio.
        static constexpr std::size_t MAX_ACCUMULATOR_SIZE = FFT_FRAME_SIZE * 2;

        // Exponential-moving-average factor applied to `fftBins` across
        // successive analysis frames, Higher = snappier/noisier, lower =
        // smoother/laggier.
        static constexpr float SMOOTHING_ALPHA = 0.2f;

        void RunAnalysis(AnalyzedAudioFrame& out);
        void MapMagnitudesToLogBins(std::array<float, ANALYSIS_FFT_BIN_COUNT>& outBins) const;

        PFFFT_Setup* fftSetup;
        float*       windowedInput; // FFT_FRAME_SIZE, 16-byte aligned due to pffft requirement
        float*       spectrum;      // FFT_FRAME_SIZE, 16-byte aligned due to pffft requirement
        // We work in dB space rather than raw linear to better represent
        // human hearing/response to music, since bass frequencies are much
        // louder than treble etc.
        // `FFT_FRAME_SIZE / 2 + 1` is the number of usable bins (DC..Nyquist inclusive).
        std::array<float, FFT_FRAME_SIZE / 2 + 1> rawSpectrumDb;
        // Normalizes raw FFT magnitudes (pffft's forward transform is
        // unscaled - see pffft.h) back down to roughly the
        // input signal's own amplitude scale, compensating for both window's
        // energy reduction & DFT's linear-in-N magnitude growth for a bin-
        // aligned tone. A full-scale sine sitting exactly on a bin center
        // should come out to a magnitude of rouughly 1.0.
        float                                     windowNormalizationFactor = FFT_WINDOW.sum / 2.0f;

        // Persists across ProduceAnalysisFrame calls - this is the state
        // SMOOTHING_ALPHA smooths against.
        std::array<float, ANALYSIS_FFT_BIN_COUNT> smoothedBins{};

        std::vector<float> accumulator;
    };

} // namespace VSBloom::Audio

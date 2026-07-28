#include "AudioAnalyzer.hpp"
#include <algorithm>
#include <cmath>
#include <pffft.h>
#include <stdexcept>

namespace VSBloom::Audio {

    AudioAnalyzer::AudioAnalyzer() {
        fftSetup = pffft_new_setup(static_cast<int>(FFT_FRAME_SIZE), PFFFT_REAL);
        if (fftSetup == nullptr) {
            throw std::runtime_error("Failed to initialize a pffft FFT setup");
        }

        windowedInput = static_cast<float*>(pffft_aligned_malloc(FFT_FRAME_SIZE * sizeof(float)));
        spectrum      = static_cast<float*>(pffft_aligned_malloc(FFT_FRAME_SIZE * sizeof(float)));
        if (windowedInput == nullptr || spectrum == nullptr) {
            pffft_aligned_free(windowedInput);
            pffft_aligned_free(spectrum);
            pffft_destroy_setup(fftSetup);
            throw std::runtime_error("Failed to allocate aligned FFT buffers");
        }

        accumulator.reserve(MAX_ACCUMULATOR_SIZE);
    }

    AudioAnalyzer::~AudioAnalyzer() {
        pffft_aligned_free(windowedInput);
        pffft_aligned_free(spectrum);
        pffft_destroy_setup(fftSetup);
    }

    bool AudioAnalyzer::AccumulateSamples(const float* samples, std::size_t sampleCount) {
        accumulator.insert(accumulator.end(), samples, samples + sampleCount);

        // Shouldn't genuinely be hit unless sample data is being fed in at
        // an abnormal rate, trims down the accumulator to one window's worth
        // of the newest audio data to avoid a stale backlog building up of
        // multiple hops worth of sample data.
        if (accumulator.size() > MAX_ACCUMULATOR_SIZE) {
            const std::size_t excessSamples = accumulator.size() - FFT_FRAME_SIZE;
            accumulator.erase(accumulator.begin(), accumulator.begin() + excessSamples);
        }

        return HasEnoughSamplesForAnalysis();
    }

    void AudioAnalyzer::ProduceAnalysisFrame(AnalyzedAudioFrame& out) {
        RunAnalysis(out);
        // Advance by the hop size, so that the the remaining
        // `FFT_FRAME_SIZE - FFT_HOP_SIZE` samples stay buffered and get
        // reused as the start of the next analysis window.
        accumulator.erase(accumulator.begin(), accumulator.begin() + FFT_HOP_SIZE);
    }

    bool AudioAnalyzer::HasEnoughSamplesForAnalysis() const {
        return accumulator.size() >= FFT_FRAME_SIZE;
    }

    void AudioAnalyzer::RunAnalysis(AnalyzedAudioFrame& outFrame) {
        for (std::size_t i = 0; i < FFT_FRAME_SIZE; ++i) {
            windowedInput[i] = accumulator[i] * FFT_WINDOW.coefficients[i];
        }

        // `work = nullptr` is intended here - per pffft.h,
        // passing NULL makes pffft use its own stack buffer, which docs
        // recommend as the best strategy for N < 16384.
        pffft_transform_ordered(fftSetup, windowedInput, spectrum, nullptr, PFFFT_FORWARD);

        // "Ordered" real-forward packing (see pffft.h): spectrum[0]/[1] hold
        // the DC and Nyquist bins (both purely real-valued), then `spectrum[2k]/[2k+1]`
        // hold the real/imaginary parts of bin `k`, for `k` in `1 .. FFT_FRAME_SIZE/2 - 1`.
        //
        // Converted to dB immediately, `dbEpsilon` keeps log10 away from -inf'ing on silent bins.
        rawSpectrumDb[0] = LinearToDBSpace(std::abs(spectrum[0]) / windowNormalizationFactor); // DC
        rawSpectrumDb[FFT_FRAME_SIZE / 2] =
            LinearToDBSpace(std::abs(spectrum[1]) / windowNormalizationFactor); // Nyquist

        for (std::size_t k = 1; k < FFT_FRAME_SIZE / 2; ++k) {
            const float realComp      = spectrum[2 * k];
            const float imaginaryComp = spectrum[2 * k + 1];
            const float linearMag =
                std::sqrt(realComp * realComp + imaginaryComp * imaginaryComp) / windowNormalizationFactor;
            rawSpectrumDb[k] = LinearToDBSpace(linearMag);
        }

        fftBinArray_t rawBins;
        MapMagnitudesToLogBins(rawBins);
        // Temporal smoothing (see SMOOTHING_ALPHA's doc comment) - blends
        // this frame's freshly-computed bins into the persisted
        // `smoothedBins` state rather than handing the raw per-frame values
        // straight out.
        for (std::size_t i = 0; i < ANALYSIS_FFT_BIN_COUNT; ++i) {
            smoothedBins[i] += (rawBins[i] - smoothedBins[i]) * SMOOTHING_ALPHA;
        }
        outFrame.fftBins = smoothedBins;
        // Derived from the *smoothed* bins deliberately - the EQ bands inherit
        // SMOOTHING_ALPHA's temporal smoothing and the dB->0..1 normalization
        // for free, so they sit on the same scale as `fftBins` downstream.
        MapFFTBinsToEQBands(rawBins, outFrame.instEQ);
        MapFFTBinsToEQBands(smoothedBins, outFrame.smoothEQ);

        float sumPCMSquares = 0.0f; // average PCM amplitude over the frame
        for (std::size_t i = 0; i < FFT_FRAME_SIZE; ++i) {
            sumPCMSquares += accumulator[i] * accumulator[i];
        }
        outFrame.avgAmplitude = std::sqrt(sumPCMSquares / static_cast<float>(FFT_FRAME_SIZE));
    }

    void AudioAnalyzer::MapMagnitudesToLogBins(fftBinArray_t& outBins) const {
        // Display range for the dB-scaled output bins
        constexpr float dbFloor   = -50.0f;
        constexpr float dbCeiling = 0.0f;
        // Nyquist raw-bin index, as a float for the fractional math below.
        const float     maxUsableIdx = static_cast<float>(rawSpectrumDb.size() - 1);

        for (std::size_t band = 0; band < ANALYSIS_FFT_BIN_COUNT; ++band) {
            // Log-spaced band edges to expand the low end of the spectrum
            // for a more perceptually important range mapping
            const float freqLow = FFT_BINS_MIN_FREQUENCY_HZ
                                  * std::pow(
                                      FFT_BINS_MAX_FREQUENCY_HZ / FFT_BINS_MIN_FREQUENCY_HZ,
                                      static_cast<float>(band) / static_cast<float>(ANALYSIS_FFT_BIN_COUNT)
                                  );
            const float freqHigh = FFT_BINS_MIN_FREQUENCY_HZ
                                   * std::pow(
                                       FFT_BINS_MAX_FREQUENCY_HZ / FFT_BINS_MIN_FREQUENCY_HZ,
                                       static_cast<float>(band + 1) / static_cast<float>(ANALYSIS_FFT_BIN_COUNT)
                                   );

            // Fractional raw-bin positions, clamped away from raw bin 0 (the DC term).
            const float fracLow  = std::clamp(freqLow / HZ_PER_FFT_BIN, 1.0f, maxUsableIdx);
            const float fracHigh = std::clamp(freqHigh / HZ_PER_FFT_BIN, fracLow, maxUsableIdx);

            float bandDb;
            if (fracHigh - fracLow < 1.0f) {
                // Band narrower than a single raw FFT bin, interpolate
                // at the band's center instead of flooring both
                // edges to the same integer index.
                const float       center  = (fracLow + fracHigh) * 0.5f;
                const std::size_t lowIdx  = static_cast<std::size_t>(center);
                const std::size_t highIdx = std::min(lowIdx + 1, rawSpectrumDb.size() - 1);
                const float       t       = center - static_cast<float>(lowIdx);
                bandDb                    = rawSpectrumDb[lowIdx] * (1.0f - t) + rawSpectrumDb[highIdx] * t;
            } else {
                // Band spans multiple raw bins - take the loudest one.
                const std::size_t idxLow  = static_cast<std::size_t>(fracLow);
                const std::size_t idxHigh = std::min(static_cast<std::size_t>(fracHigh), rawSpectrumDb.size() - 1);

                bandDb = rawSpectrumDb[idxLow];
                for (std::size_t idx = idxLow + 1; idx < idxHigh; ++idx) {
                    bandDb = std::max(bandDb, rawSpectrumDb[idx]);
                }
            }

            outBins[band] = std::clamp((bandDb - dbFloor) / (dbCeiling - dbFloor), 0.0f, 1.0f);
        }
    }

    void AudioAnalyzer::MapFFTBinsToEQBands(const fftBinArray_t& fftBins, eqArray_t& outEQBands) const {
        for (std::size_t bandIdx = 0; bandIdx < AudioEQBand::__Count__; ++bandIdx) {
            const frequencyRangeHz& bandRange = EQ_BAND_FREQUENCY_RANGES[bandIdx];

            // Continuous bin-space edges of the EQ frequency band.
            // EQ ranges are ensured to sit inside [FFT_BINS_MIN_FREQUENCY_HZ, FFT_BINS_MAX_FREQUENCY_HZ]
            // as of right now, but in case of EQ_BAND_FREQUENCY_RANGES getting retuned we'll clamp anyways
            // so that we can never index OOB.
            const float posLow = std::clamp(
                FrequencyToLogBinPosition(bandRange.first),
                0.0f,
                static_cast<float>(ANALYSIS_FFT_BIN_COUNT)
            );
            const float posHigh = std::clamp(
                FrequencyToLogBinPosition(bandRange.second),
                posLow,
                static_cast<float>(ANALYSIS_FFT_BIN_COUNT)
            );

            // Each bin contributes proportionally to how much of the EQ band's frequency range
            // it actually overlaps. Otherwise partial edge bins would either be counted
            // fully and over-weight a neighboring band's energy...or dropped entirely
            //
            // ?This is a coverage-weighted mean currently; maybe switch to a 'max' approach later(?)
            const std::size_t firstBin = static_cast<std::size_t>(posLow);
            const std::size_t lastBin =
                std::min(static_cast<std::size_t>(std::ceil(posHigh)), ANALYSIS_FFT_BIN_COUNT) - 1;

            float weightedSum = 0.0f;
            float totalWeight = 0.0f;
            for (std::size_t bin = firstBin; bin <= lastBin && bin < ANALYSIS_FFT_BIN_COUNT; ++bin) {
                const float overlap =
                    std::min(posHigh, static_cast<float>(bin + 1)) - std::max(posLow, static_cast<float>(bin));
                if (overlap <= 0.0f) {
                    continue;
                }
                weightedSum += fftBins[bin] * overlap;
                totalWeight += overlap;
            }

            // totalWeight here will be 0 only if the band is degenerate for some reason (bad config...zero width etc.)
            outEQBands[bandIdx] = totalWeight > 0.0f ? weightedSum / totalWeight
                                                     : fftBins[std::min(firstBin, ANALYSIS_FFT_BIN_COUNT - 1)];
        }
    }

} // namespace VSBloom::Audio

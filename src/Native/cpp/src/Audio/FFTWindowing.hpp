/**
 * Common FFT window generator functions.
 *
 * Each generator fills an N-sample coefficient array (symmetric form,
 * denominator N-1) and returns the coefficient sum so callers can derive a
 * magnitude normalization factor (e.g. `sum / 2` for real FFT of a
 * bin-aligned full-scale sine).
 */
#pragma once

#include <array>
#include <cmath>
#include <cstddef>
#include <numbers>

#define DefineWindowGenerator(WindowName)                                                                              \
    template <std::size_t N>                                                                                           \
    FFTWindow<N> WindowName()

namespace VSBloom::Audio::FFTWindowing {

    template <std::size_t N>
    struct FFTWindow {
        std::array<float, N> coefficients{};
        float                sum = 0.0f;
    };

    namespace {

        template <std::size_t N>
        constexpr float Phase(std::size_t n) {
            // Symmetric windows use N-1 so the first and last samples both
            // land on the window's endpoints (typically 0 for Hann/Blackman).
            static_assert(N >= 2, "FFT windows require at least 2 samples");
            return 2.0f * std::numbers::pi_v<float> * static_cast<float>(n) / static_cast<float>(N - 1);
        }

        template <std::size_t N, typename WeightFn>
        FFTWindow<N> Generate(WeightFn&& weightAt) {
            FFTWindow<N> window;
            for (std::size_t n = 0; n < N; ++n) {
                const float w          = weightAt(n);
                window.coefficients[n] = w;
                window.sum += w;
            }
            return window;
        }

    } // namespace

    /** Narrowest main lobe, highest side lobes. */
    DefineWindowGenerator(Rectangular) {
        return Generate<N>([](std::size_t) { return 1.0f; });
    }

    /** Widens the main lobe and reduces side lobes. */
    DefineWindowGenerator(Hann) {
        return Generate<N>([](std::size_t n) { return 0.5f * (1.0f - std::cos(Phase<N>(n))); });
    }

    /** Similar to Hann, slightly higher side-lobe floor near the main lobe. */
    DefineWindowGenerator(Hamming) {
        return Generate<N>([](std::size_t n) { return 0.54f - 0.46f * std::cos(Phase<N>(n)); });
    }

    /** Linear taper to zero at both ends. */
    DefineWindowGenerator(Bartlett) {
        return Generate<N>([](std::size_t n) {
            const float x = static_cast<float>(n) / static_cast<float>(N - 1);
            return 1.0f - std::abs(2.0f * x - 1.0f);
        });
    }

    /** Alias for Bartlett that I like more. */
    DefineWindowGenerator(Triangle) {
        return Bartlett<N>();
    }

    /** Parabolic taper; similar trade-offs to Bartlett. */
    DefineWindowGenerator(Welch) {
        return Generate<N>([](std::size_t n) {
            const float half  = 0.5f * static_cast<float>(N - 1);
            const float ratio = (static_cast<float>(n) - half) / half;
            return 1.0f - ratio * ratio;
        });
    }

    /** Lower side lobes than Hann/Hamming, wider main lobe. */
    DefineWindowGenerator(Blackman) {
        return Generate<N>([](std::size_t n) {
            const float p = Phase<N>(n);
            return 0.42f - 0.5f * std::cos(p) + 0.08f * std::cos(2.0f * p);
        });
    }

    /** Very low side lobes, wider main lobe. */
    DefineWindowGenerator(BlackmanHarris) {
        return Generate<N>([](std::size_t n) {
            const float p = Phase<N>(n);
            return 0.35875f - 0.48829f * std::cos(p) + 0.14128f * std::cos(2.0f * p) - 0.01168f * std::cos(3.0f * p);
        });
    }

    /** Similar to BlackmanHarris. */
    DefineWindowGenerator(Nuttall) {
        return Generate<N>([](std::size_t n) {
            const float p = Phase<N>(n);
            return 0.355768f - 0.487396f * std::cos(p) + 0.144232f * std::cos(2.0f * p)
                   - 0.012604f * std::cos(3.0f * p);
        });
    }

    /**
     * Poorst frequency resolution, but amplitude of a bin-centered
     * tone is recovered with very little scalloping loss.
     */
    DefineWindowGenerator(FlatTop) {
        return Generate<N>([](std::size_t n) {
            const float p = Phase<N>(n);
            return 0.21557895f - 0.41663158f * std::cos(p) + 0.277263158f * std::cos(2.0f * p)
                   - 0.083578947f * std::cos(3.0f * p) + 0.006947368f * std::cos(4.0f * p);
        });
    }

} // namespace VSBloom::Audio::FFTWindowing

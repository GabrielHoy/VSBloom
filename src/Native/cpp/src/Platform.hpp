/**
 * Native Platform Derivation
 *
 * Provides declarations for VSBloom's native platform derivation and
 * associated behaviors, depending on the target platform and
 * architecture the binary is built for.
 */
#pragma once
#include <string>

namespace VSBloom {

#if defined(_WIN32) || defined(_WIN64)
    constexpr const char* PLATFORM = "win32";
#elif defined(__APPLE__) && defined(__MACH__)
    constexpr const char* PLATFORM = "darwin";
#elif defined(__linux__)
    constexpr const char* PLATFORM = "linux";
#else
    constexpr const char* PLATFORM = "unknown";
#endif

#if defined(_M_X64) || defined(__x86_64__) || defined(__amd64__)
    constexpr const char* ARCH = "x64";
#elif defined(_M_IX86) || defined(__i386__)
    constexpr const char* ARCH = "x86";
#elif defined(_M_ARM64) || defined(__aarch64__)
    constexpr const char* ARCH = "arm64";
#elif defined(_M_ARM) || defined(__arm__)
    constexpr const char* ARCH = "arm";
#else
    constexpr const char* ARCH = "unknown";
#endif

    inline const std::string GetPlatformSlug() {
        return std::string(PLATFORM) + "-" + std::string(ARCH);
    }

} // namespace VSBloom

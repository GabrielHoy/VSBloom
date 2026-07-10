#include "DeviceId.hpp"
#include <array>
#include <bit>

namespace VSBloom::Audio {

    namespace {

        constexpr char kHex[] = "0123456789abcdef";

        int FromHexDigit(char c) {
            if (c >= '0' && c <= '9') {
                return c - '0';
            }
            if (c >= 'a' && c <= 'f') {
                return c - 'a' + 10;
            }
            if (c >= 'A' && c <= 'F') {
                return c - 'A' + 10;
            }
            return -1;
        }

        // `std::bit_cast` requires both sides to be the same size and
        // trivially copyable - `ma_device_id` (a plain C union of trivial
        // backend-specific ID types) qualifies, so this is a compiler-
        // checked bit-for-bit reinterpretation rather than a raw pointer
        // cast we have to trust ourselves to have sized correctly.
        using DeviceIdBytes = std::array<unsigned char, sizeof(ma_device_id)>;

    } // namespace

    std::string DeviceIdToHex(const ma_device_id& id) {
        const DeviceIdBytes bytes = std::bit_cast<DeviceIdBytes>(id);

        std::string hex;
        hex.reserve(bytes.size() * 2u);
        for (unsigned char b : bytes) {
            hex += kHex[b >> 4u];
            hex += kHex[b & 0xFu];
        }
        return hex;
    }

    std::optional<ma_device_id> DeviceIdFromHex(const std::string& hex) {
        if (hex.size() != sizeof(ma_device_id) * 2u) {
            return std::nullopt;
        }

        DeviceIdBytes bytes{};
        for (std::size_t i = 0; i < bytes.size(); ++i) {
            const int hi = FromHexDigit(hex[i * 2u]);
            const int lo = FromHexDigit(hex[i * 2u + 1u]);
            if (hi < 0 || lo < 0) {
                return std::nullopt;
            }
            bytes[i] = static_cast<unsigned char>((hi << 4) | lo);
        }
        return std::bit_cast<ma_device_id>(bytes);
    }

} // namespace VSBloom::Audio

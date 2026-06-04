#include "IPCCryptography.hpp"
#include <memory>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <stdexcept>
#include <vector>

namespace VSBloom::IPC::Cryptography {

    namespace {

        constexpr char kB64Chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        std::string Base64Encode(const std::uint8_t* data, std::size_t len) {
            std::string out;
            out.reserve(((len + 2u) / 3u) * 4u);
            for (std::size_t i = 0; i < len; i += 3) {
                std::uint32_t t = static_cast<std::uint32_t>(data[i]) << 16u;
                if (i + 1 < len) {
                    t |= static_cast<std::uint32_t>(data[i + 1]) << 8u;
                }
                if (i + 2 < len) {
                    t |= static_cast<std::uint32_t>(data[i + 2]);
                }
                out += kB64Chars[(t >> 18u) & 0x3Fu];
                out += kB64Chars[(t >> 12u) & 0x3Fu];
                out += (i + 1 < len) ? kB64Chars[(t >> 6u) & 0x3Fu] : '=';
                out += (i + 2 < len) ? kB64Chars[(t >> 0u) & 0x3Fu] : '=';
            }
            return out;
        }

        std::optional<std::vector<std::uint8_t>> Base64Decode(const std::string& s) {
            if (s.size() % 4 != 0) {
                return std::nullopt;
            }
            auto b64val = [](char c) -> int {
                if (c >= 'A' && c <= 'Z') {
                    return c - 'A';
                }
                if (c >= 'a' && c <= 'z') {
                    return c - 'a' + 26;
                }
                if (c >= '0' && c <= '9') {
                    return c - '0' + 52;
                }
                if (c == '+') {
                    return 62;
                }
                if (c == '/') {
                    return 63;
                }
                if (c == '=') {
                    return -1;
                }
                return -2;
            };
            std::vector<std::uint8_t> out;
            out.reserve((s.size() / 4u) * 3u);
            for (std::size_t i = 0; i < s.size(); i += 4) {
                int v0 = b64val(s[i]);
                int v1 = b64val(s[i + 1]);
                int v2 = b64val(s[i + 2]);
                int v3 = b64val(s[i + 3]);
                if (v0 < 0 || v1 < 0 || v2 == -2 || v3 == -2) {
                    return std::nullopt;
                }
                out.push_back(static_cast<std::uint8_t>((v0 << 2) | (v1 >> 4)));
                if (v2 != -1) {
                    out.push_back(static_cast<std::uint8_t>((v1 << 4) | (v2 >> 2)));
                }
                if (v3 != -1) {
                    out.push_back(static_cast<std::uint8_t>((v2 << 6) | v3));
                }
            }
            return out;
        }

    } // namespace

    EncryptionKey GenerateSessionEncryptionKey() {
        EncryptionKey key{};
        if (RAND_bytes(key.data(), static_cast<int>(KEY_SIZE)) != 1) {
            throw std::runtime_error("RAND_bytes failed: could not generate session key");
        }
        return key;
    }

    std::string KeyToHex(const EncryptionKey& key) {
        static constexpr char kHex[] = "0123456789abcdef";
        std::string           hex;
        hex.reserve(KEY_SIZE * 2u);
        for (std::uint8_t b : key) {
            hex += kHex[b >> 4u];
            hex += kHex[b & 0xFu];
        }
        return hex;
    }

    std::optional<EncryptionKey> KeyFromHex(const std::string& hex) {
        if (hex.size() != KEY_SIZE * 2u) {
            return std::nullopt;
        }
        auto fromHexDigit = [](char c) -> int {
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
        };
        EncryptionKey key{};
        for (std::size_t i = 0; i < KEY_SIZE; ++i) {
            int hi = fromHexDigit(hex[i * 2u]);
            int lo = fromHexDigit(hex[i * 2u + 1u]);
            if (hi < 0 || lo < 0) {
                return std::nullopt;
            }
            key[i] = static_cast<std::uint8_t>((hi << 4) | lo);
        }
        return key;
    }

    std::string Encrypt(const EncryptionKey& key, const std::string& plaintext) {
        std::uint8_t nonce[NONCE_SIZE]{};
        if (RAND_bytes(nonce, static_cast<int>(NONCE_SIZE)) != 1) {
            throw std::runtime_error("RAND_bytes failed: could not generate nonce");
        }

        auto ctx =
            std::unique_ptr<EVP_CIPHER_CTX, decltype(&EVP_CIPHER_CTX_free)>(EVP_CIPHER_CTX_new(), EVP_CIPHER_CTX_free);
        if (!ctx) {
            throw std::runtime_error("EVP_CIPHER_CTX_new failed");
        }

        if (EVP_EncryptInit_ex(ctx.get(), EVP_aes_256_gcm(), nullptr, nullptr, nullptr) != 1
            || EVP_CIPHER_CTX_ctrl(ctx.get(), EVP_CTRL_GCM_SET_IVLEN, static_cast<int>(NONCE_SIZE), nullptr) != 1
            || EVP_EncryptInit_ex(ctx.get(), nullptr, nullptr, key.data(), nonce) != 1) {
            throw std::runtime_error("AES-256-GCM EncryptInit failed");
        }

        std::vector<std::uint8_t> ciphertext(plaintext.size());
        int                       outLen = 0;
        if (EVP_EncryptUpdate(
                ctx.get(),
                ciphertext.data(),
                &outLen,
                reinterpret_cast<const std::uint8_t*>(plaintext.data()),
                static_cast<int>(plaintext.size())
            )
            != 1) {
            throw std::runtime_error("EVP_EncryptUpdate failed");
        }
        int finalLen = 0;
        if (EVP_EncryptFinal_ex(ctx.get(), ciphertext.data() + outLen, &finalLen) != 1) {
            throw std::runtime_error("EVP_EncryptFinal_ex failed");
        }
        const std::size_t ciphertextSize = static_cast<std::size_t>(outLen + finalLen);

        std::uint8_t tag[TAG_SIZE]{};
        if (EVP_CIPHER_CTX_ctrl(ctx.get(), EVP_CTRL_GCM_GET_TAG, static_cast<int>(TAG_SIZE), tag) != 1) {
            throw std::runtime_error("EVP_CTRL_GCM_GET_TAG failed");
        }

        // Packed as (nonce || ciphertext || tag) & thusly converted to B64
        std::vector<std::uint8_t> packed;
        packed.reserve(NONCE_SIZE + ciphertextSize + TAG_SIZE);
        packed.insert(packed.end(), nonce, nonce + NONCE_SIZE);
        packed.insert(packed.end(), ciphertext.data(), ciphertext.data() + ciphertextSize);
        packed.insert(packed.end(), tag, tag + TAG_SIZE);

        return Base64Encode(packed.data(), packed.size());
    }

    std::optional<std::string> Decrypt(const EncryptionKey& key, const std::string& encryptedBase64) {
        auto packed = Base64Decode(encryptedBase64);
        if (!packed.has_value() || packed->size() < NONCE_SIZE + TAG_SIZE) {
            return std::nullopt;
        }

        const std::uint8_t* nonce         = packed->data();
        const std::size_t   ciphertextLen = packed->size() - NONCE_SIZE - TAG_SIZE;
        const std::uint8_t* ciphertext    = packed->data() + NONCE_SIZE;
        // (Non-const so the EVP_CTRL_GCM_SET_TAG void* parameter is satisfied without a cast)
        std::uint8_t*       tag = packed->data() + NONCE_SIZE + ciphertextLen;

        auto ctx =
            std::unique_ptr<EVP_CIPHER_CTX, decltype(&EVP_CIPHER_CTX_free)>(EVP_CIPHER_CTX_new(), EVP_CIPHER_CTX_free);
        if (!ctx) {
            return std::nullopt;
        }

        if (EVP_DecryptInit_ex(ctx.get(), EVP_aes_256_gcm(), nullptr, nullptr, nullptr) != 1
            || EVP_CIPHER_CTX_ctrl(ctx.get(), EVP_CTRL_GCM_SET_IVLEN, static_cast<int>(NONCE_SIZE), nullptr) != 1
            || EVP_DecryptInit_ex(ctx.get(), nullptr, nullptr, key.data(), nonce) != 1) {
            return std::nullopt;
        }

        std::vector<std::uint8_t> plaintext(ciphertextLen);
        int                       outLen = 0;
        if (EVP_DecryptUpdate(ctx.get(), plaintext.data(), &outLen, ciphertext, static_cast<int>(ciphertextLen)) != 1) {
            return std::nullopt;
        }

        // Tag must be set before DecryptFinal: it is what gets verified
        if (EVP_CIPHER_CTX_ctrl(ctx.get(), EVP_CTRL_GCM_SET_TAG, static_cast<int>(TAG_SIZE), tag) != 1) {
            return std::nullopt;
        }

        int finalLen = 0;
        // Returns <= 0 on auth tag mismatch, any bit flip in transit is caught here
        if (EVP_DecryptFinal_ex(ctx.get(), plaintext.data() + outLen, &finalLen) <= 0) {
            return std::nullopt;
        }

        return std::string(reinterpret_cast<char*>(plaintext.data()), static_cast<std::size_t>(outLen + finalLen));
    }

} // namespace VSBloom::IPC::Cryptography

/**
 * IPC Encryption
 *
 * AES-256-GCM authenticated encryption for the IPC channel between the
 * VSBloom Native Runtime and its TypeScript host.
 *
 * A single session key is generated at startup, distributed in plaintext
 * via the `i-am-alive` handshake, and used for all IPC traffic in both
 * directions after that point.
 *
 * Wire format for encrypted messages:
 *   base64( nonce(12 bytes) || ciphertext(N bytes) || gcm_tag(16 bytes) )
 */

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>

namespace VSBloom::IPC::Cryptography {

    constexpr std::size_t KEY_SIZE   = 32; // AES-256
    constexpr std::size_t NONCE_SIZE = 12; // GCM recommended IV length
    constexpr std::size_t TAG_SIZE   = 16; // GCM auth tag

    using EncryptionKey = std::array<std::uint8_t, KEY_SIZE>;

    EncryptionKey                GenerateSessionEncryptionKey();
    std::string                  KeyToHex(const EncryptionKey& key);
    std::optional<EncryptionKey> KeyFromHex(const std::string& hex);

    /**
     * Encrypts plaintext with AES-256-GCM encryption.
     * Returns B64 in the form of nonce||ciphertext||tag.
     */
    std::string Encrypt(const EncryptionKey& key, const std::string& plaintext);

    /**
     * Decrypts a blob produced at some point by Encrypt.
     *
     * Returns nullopt on auth failure or bad input.
     */
    std::optional<std::string> Decrypt(const EncryptionKey& key, const std::string& encryptedBase64);

} // namespace VSBloom::IPC::Cryptography

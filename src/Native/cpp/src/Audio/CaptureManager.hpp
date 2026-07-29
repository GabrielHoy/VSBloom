/**
 * Loopback Capture Manager
 *
 * Owns the full set of currently-active loopback capture sessions and
 * reconciles it against whatever "desired" device list the parent process
 * last synced over to us.
 *
 * Owns an 'aggregator' thread - lazily started upon a loopback capture
 * session becoming active, torn down when the last one is removed.
 */
#pragma once

#include "CaptureSession.hpp"
#include <atomic>
#include <chrono>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace VSBloom::Audio {

    typedef std::function<void(const AnalyzedAudioFrame&)> FrameAggregationCallback_t;

    class CaptureManager {
      public:
        /**
         * @param pollsPerSecond How often the aggregator thread polls
         * active sessions & emits a merged frame
         *
         * *while at least one session is active.
         */
        explicit CaptureManager(int pollsPerSecond = 30);
        ~CaptureManager();

        CaptureManager(const CaptureManager&)            = delete;
        CaptureManager& operator=(const CaptureManager&) = delete;

        /**
         * Reconciles active capture sessions against a new desired set of
         * device IDs (hex-encoded, as handed out by device enumeration).
         *
         * Invalid and/or erroring devices are skipped silently, so the
         * returned list is what is *actually* being captured after the
         * reconcile - *this may be a subset of what was asked for*. Compare it
         * against `desiredDeviceIdsHex` if the caller cares about which
         * requests were rejected.
         *
         * Returned IDs are sorted, so an unchanged capture set always produces
         * a byte-identical list - this is useful for TS-land. Callers replicating
         * this upward currently depend on that: an unordered_map's iteration order
         * would otherwise jitter between calls & emit patches for a set that never
         * actually changed in any meaningful way.
         */
        [[nodiscard]]
        std::vector<std::string> UpdateCurrentCapturedDevices(const std::vector<std::string>& desiredDeviceIdsHex);

        /**
         * The hex IDs of every device currently being captured, sorted (see
         * the ordering note on UpdateCurrentCapturedDevices).
         *
         * Exists so the capture set can be *queried* without mutating it -
         * needed to answer a parent-process resync (reconnect, pseudo-server
         * promotion) that must not disturb capture, and for debug tooling.
         *
         * These are IDs rather than full `AudioDevice`s deliberately: device
         * metadata like `isDefault` is live state that changes without capture
         * being touched, so it must be joined against a fresh enumeration at
         * read time rather than cached per-session and served stale.
         */
        [[nodiscard]]
        std::vector<std::string> GetCurrentlyCapturedDeviceIds() const;

        /**
         * Registers a callback that gets invoked once per 'aggregation tick'
         * with a merged audio analyses snapshot, combining
         * the latest analyses from all active capture sessions.
         *
         * Replaces any previously registered callback.
         *
         * Not invoked while no sessions are active,
         * since naturally...no aggregation thread = no aggregation
         *
         * The callback runs synchronously on the internal aggregator thread,
         * so it's worth stating - **Do not call into CaptureManager from
         * within the OnFrameAggregatedCallback.** You'll end up with deadlock
         * nightmares. Marshal any resulting work on the CaptureManager to
         * another thread instead.
         */
        void SetOnFrameAggregatedCallback(FrameAggregationCallback_t callback);

      private:
        void StartAggregationThreadIfNeeded();
        void StopAggregationThreadIfRunning();
        void MainAggregatorThread();

        /** Snapshot the live session keys. **Requires `sessionsMutex` held.** */
        [[nodiscard]]
        std::vector<std::string> CollectSessionDeviceIdsLocked() const;

        const std::chrono::duration<double> pollInterval;

        mutable std::mutex                                               sessionsMutex;
        std::unordered_map<std::string, std::unique_ptr<CaptureSession>> sessions;

        std::mutex                 frameAgregCbMutex;
        FrameAggregationCallback_t onFrameAggregatedCallback;

        std::thread       aggregatorThread;
        std::atomic<bool> aggregatorShouldRun{false};
    };

} // namespace VSBloom::Audio

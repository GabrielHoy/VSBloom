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
         * Invalid and/or erroring devices are skipped silently.
         */
        void UpdateCurrentCapturedDevices(const std::vector<std::string>& desiredDeviceIdsHex);

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
        void SetOnFrameAggregatedCallback(std::function<void(const AudioAnalysisSnapshot&)> callback);

      private:
        void StartAggregationThreadIfNeeded();
        void StopAggregationThreadIfRunning();
        void MainAggregatorThread();

        const std::chrono::duration<double> pollInterval;

        mutable std::mutex                                               sessionsMutex;
        std::unordered_map<std::string, std::unique_ptr<CaptureSession>> sessions;

        std::mutex                                        frameAgregCbMutex;
        std::function<void(const AudioAnalysisSnapshot&)> onFrameAggregatedCallback;

        std::thread       aggregatorThread;
        std::atomic<bool> aggregatorShouldRun{false};
    };

} // namespace VSBloom::Audio

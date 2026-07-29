#include "CaptureManager.hpp"
#include "Device/DeviceId.hpp"
#include <algorithm>
#include <exception>
#include <unordered_set>

namespace VSBloom::Audio {

    CaptureManager::CaptureManager(int pollsPerSecond)
        : pollInterval(1.0 / static_cast<double>(pollsPerSecond)) {
    }

    CaptureManager::~CaptureManager() {
        StopAggregationThreadIfRunning();
        // Each of the actual capture sessions handle their own
        // cleanup and uninitialization behavior, not much to do here.
    }

    std::vector<std::string> CaptureManager::CollectSessionDeviceIdsLocked() const {
        std::vector<std::string> deviceIdsHex;
        deviceIdsHex.reserve(sessions.size());

        for (const auto& sessionEntry : sessions) {
            deviceIdsHex.push_back(sessionEntry.first);
        }

        // `sessions` is an unordered_map, so its iteration order is unspecified
        // and free to change between calls even when the contents did not. Sort
        // so that "same capture set" always yields the same list - callers
        // replicate this upward as state, where a jittering order would look
        // like a change that never happened.
        std::sort(deviceIdsHex.begin(), deviceIdsHex.end());
        return deviceIdsHex;
    }

    std::vector<std::string> CaptureManager::GetCurrentlyCapturedDeviceIds() const {
        std::lock_guard<std::mutex> lock(sessionsMutex);
        return CollectSessionDeviceIdsLocked();
    }

    std::vector<std::string>
    CaptureManager::UpdateCurrentCapturedDevices(const std::vector<std::string>& desiredDeviceIdsHex) {
        const std::unordered_set<std::string> desiredCaptureDevices(
            desiredDeviceIdsHex.begin(),
            desiredDeviceIdsHex.end()
        );

        bool                     areAnyLoopbackSessionsActivePostReconcile;
        std::vector<std::string> capturedDeviceIdsPostReconcile;
        {
            std::lock_guard<std::mutex> lock(sessionsMutex);

            for (auto it = sessions.begin(); it != sessions.end();) {
                if (!desiredCaptureDevices.contains(it->first)) {
                    it = sessions.erase(it);
                } else {
                    ++it;
                }
            }

            for (const std::string& deviceIdHex : desiredCaptureDevices) {
                if (sessions.contains(deviceIdHex)) {
                    continue;
                }

                const std::optional<ma_device_id> deviceId = DeviceIdFromHex(deviceIdHex);
                if (!deviceId.has_value()) {
                    continue; // malformed ID sent over to us probably? skip it
                }

                try {
                    sessions.emplace(deviceIdHex, std::make_unique<CaptureSession>(*deviceId));
                } catch (const std::exception&) {
                    // The device likely disappeared or failed to open for
                    // capture; the parent process should 'find out' about this
                    // during their next enumeration rather than this call throwing
                    // so we'll silently ignore it for now.
                    continue;
                }
            }

            // Collected here, inside the same breath of us reconciling
            // so the returned list is exactly the set that this call
            // produced - re-locking afterwards would let another reconcile
            // intermingle & hand the caller another session's result
            capturedDeviceIdsPostReconcile            = CollectSessionDeviceIdsLocked();
            areAnyLoopbackSessionsActivePostReconcile = !sessions.empty();
        }

        // Stopping the aggregation thread must happen after the above sessionsMutex
        // `lock` variable is released since the `StopAggregationThreadIfRunning`
        // call ends up joining the aggregator thread itself, which, if that aggregator
        // thread happens to be trying to lock `sessionsMutex` during a poll at the
        // same time - deadlock.
        if (!areAnyLoopbackSessionsActivePostReconcile) {
            StopAggregationThreadIfRunning();
        } else {
            StartAggregationThreadIfNeeded();
        }

        return capturedDeviceIdsPostReconcile;
    }

    void CaptureManager::SetOnFrameAggregatedCallback(FrameAggregationCallback_t callback) {
        std::lock_guard<std::mutex> lock(frameAgregCbMutex);
        onFrameAggregatedCallback = std::move(callback);
    }

    void CaptureManager::StartAggregationThreadIfNeeded() {
        if (aggregatorShouldRun.exchange(true)) {
            return; // already running
        }
        aggregatorThread = std::thread(&CaptureManager::MainAggregatorThread, this);
    }

    void CaptureManager::StopAggregationThreadIfRunning() {
        if (!aggregatorShouldRun.exchange(false)) {
            return; // wasn't running
        }
        if (aggregatorThread.joinable()) {
            aggregatorThread.join();
        }
    }

    void CaptureManager::MainAggregatorThread() {
        auto nextTick = std::chrono::steady_clock::now();

        while (aggregatorShouldRun.load()) {
            nextTick += std::chrono::duration_cast<std::chrono::steady_clock::duration>(pollInterval);

            AnalyzedAudioFrame mergedSnapshot;
            {
                std::lock_guard<std::mutex> lock(sessionsMutex);
                for (const auto& sessionEntry : sessions) {
                    // NOTE: this whole analysis step is a placeholder pending real FFT.
                    const AnalyzedAudioFrame sessionSnapshot = sessionEntry.second->GetLatestAnalysisSnapshot();
                    mergedSnapshot.avgAmplitude += sessionSnapshot.avgAmplitude;
                    for (std::size_t i = 0; i < mergedSnapshot.fftBins.size() && i < sessionSnapshot.fftBins.size();
                         ++i) {
                        mergedSnapshot.fftBins[i] += sessionSnapshot.fftBins[i];
                    }
                    for (std::size_t i = 0; i < mergedSnapshot.instEQ.size() && i < sessionSnapshot.instEQ.size();
                         ++i) {
                        mergedSnapshot.instEQ[i] += sessionSnapshot.instEQ[i];
                    }
                    for (std::size_t i = 0; i < mergedSnapshot.smoothEQ.size() && i < sessionSnapshot.smoothEQ.size();
                         ++i) {
                        mergedSnapshot.smoothEQ[i] += sessionSnapshot.smoothEQ[i];
                    }
                }
            }

            {
                std::lock_guard<std::mutex> lock(frameAgregCbMutex);
                if (onFrameAggregatedCallback) {
                    onFrameAggregatedCallback(mergedSnapshot);
                }
            }

            std::this_thread::sleep_until(nextTick);
        }
    }

} // namespace VSBloom::Audio

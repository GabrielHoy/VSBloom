#include "CaptureManager.hpp"
#include "Device/DeviceId.hpp"
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

    void CaptureManager::UpdateCurrentCapturedDevices(const std::vector<std::string>& desiredDeviceIdsHex) {
        const std::unordered_set<std::string> desiredCaptureDevices(
            desiredDeviceIdsHex.begin(),
            desiredDeviceIdsHex.end()
        );

        bool areAnyLoopbackSessionsActivePostReconcile;
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
    }

    void CaptureManager::SetOnFrameAggregatedCallback(std::function<void(const AudioAnalysisSnapshot&)> callback) {
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

            AudioAnalysisSnapshot mergedSnapshot;
            {
                std::lock_guard<std::mutex> lock(sessionsMutex);
                for (const auto& sessionEntry : sessions) {
                    // NOTE: this whole analysis step is a placeholder pending real FFT.
                    const AudioAnalysisSnapshot sessionSnapshot = sessionEntry.second->GetLatestAnalysisSnapshot();
                    mergedSnapshot.avgAmplitude += sessionSnapshot.avgAmplitude;
                    for (std::size_t i = 0; i < mergedSnapshot.fftBins.size() && i < sessionSnapshot.fftBins.size();
                         ++i) {
                        mergedSnapshot.fftBins[i] += sessionSnapshot.fftBins[i];
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

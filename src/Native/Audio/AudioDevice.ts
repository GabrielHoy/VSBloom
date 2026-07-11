/**
 * Audio Devices
 * 
 * Provides types for Audio Devices in TypeScript, allowing us
 * to query information about them and interact directly with
 * them thanks to the VSBloom Native Runtime.
 */

export enum AudioDeviceDataFlowType {
    /**
     * Audio devices that are used for outputting audio - i.e speakers.
     */
    Render = "render",
    /**
     * Audio devices that are used for capturing audio - i.e microphones.
     */
    Capture = "capture",
}

export interface AudioDevice {
    /**
     * An internally-unique ID for the audio device.
     * 
     * This is not guaranteed to be persistent across reboots or device
     * reconnections!
     */
    readonly id: string;

    /**
     * The human-readable name of the audio device.
     */
    readonly name: string;

    /**
     * The data flow type of the audio device, render devices are generally
     * used for *outputting* audio - i.e speakers - while capture devices are
     * used for, well, capturing audio - i.e microphones.
     */
    readonly dataFlow: AudioDeviceDataFlowType;
    
    /**
     * Whether the audio device is the default one for its data flow type.
    */
    readonly isDefault: boolean;
}

export interface LoopbackCaptureDevice extends AudioDevice {
    dataFlow: Extract<AudioDeviceDataFlowType, "capture">;
}
/**
 * Audio Analysis Frames
 * 
 * Provides types and logic for working with Audio Analysis Frames
 * in TypeScript, allowing us to query information about what audio
 * is currently being outputted/inputted by any&all selected audio
 * devices that the Native Runtime has been opted into analyzing.
 * 
 * Generally speaking, by the time an Audio Analysis Frame actually
 * gets marshalled over to TypeScript here - it'll be an "Aggregated
 * Analysis Frame" - which is a single combined frame of audio analysis
 * that has been aggregated from potentially multiple individual analysis
 * frames that exist, in the case that multiple audio streams are being
 * analyzed at once.
 */

export interface AnalyzedAudioFrame {
    /**
     * FFT bins for the analyzed audio frame; bins are in logarithmic
     * frequency space, and are ordered from lowest to highest frequency.
     * 
     * Perceptual mapping & transformation of these bins has already been
     * applied inside of the Native Runtime before any audio data or FFT
     * bins get sent over to TypeScript here; if any further DSP is
     * needed it should be done there additionally...no reason to do our
     * DSP inside of TypeScript when we have a blazing fast C++ backend
     * to do it for us already haha.
     */
    fftBins: number[];

    /**
     * The average amplitude of the audio analysis frame.
     */
    avgAmplitude: number;
}
export type ValidTrailType = 'solid' | 'disconnected';

export const effectConfig = {
    disconnectedTrailSegmentLifetime: 0.75,
    type: 'disconnected' as ValidTrailType,
    color: '#FFFFFF',
    maxSolidTrailLength: 100,
    solidTrailWidth: 3,
    solidTrailSpeed: 20,
    enableAA: true
};
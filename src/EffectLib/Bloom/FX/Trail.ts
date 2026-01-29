/**
 * An implementation of a Trail effect class for VSBloom,
 * intended to be used as a basic implementation layer
 * to provide common trail-ish functionality for effects
 * to then build upon in their own specific ways.
 * 
 * Utilizes PixiJS's MeshRope class for trail rendering.
 */

import { Application, MeshRope, Point, Texture, Graphics } from 'pixi.js';
import Janitor from '../Janitors';

export type TemporalPoint = {
    timestamp: number;
} & Point;

// export default class Trail {
//     protected rope: MeshRope;

//     constructor(points: Point[]) {
        
//     }
// }
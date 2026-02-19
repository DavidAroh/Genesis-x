
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Point {
  x: number;
  y: number;
}

// Added BubbleColor type defining the valid colors for game bubbles
export type BubbleColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

// Added Bubble interface for grid-based game object management
export interface Bubble {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  color: BubbleColor;
  active: boolean;
}

// Added Particle interface for explosion and feedback animations
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface GlobeState {
  isRotating: boolean;
  isPinching: boolean;
  rotationSpeed: { x: number; y: number };
  zoom: number;
}

export interface IntelligenceData {
  region: string;
  summary: string;
  keyFacts: string[];
  strategicSignificance: string;
}

export interface DebugInfo {
  latency: number;
  screenshotBase64?: string;
  promptContext?: string;
  rawResponse?: string;
  parsedResponse?: any;
  error?: string;
  timestamp: string;
}

declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}

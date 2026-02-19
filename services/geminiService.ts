
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from "@google/genai";
import { IntelligenceData, DebugInfo, BubbleColor } from "../types";

const MODEL_NAME = "gemini-3-flash-preview";

// Added TargetCandidate interface to represent potential cluster targets for AI analysis
export interface TargetCandidate {
  id: string;
  color: string;
  size: number;
  row: number;
  col: number;
  pointsPerBubble: number;
  description: string;
}

// Added getStrategicHint to provide tactical advice and targeting data for the slingshot game
export const getStrategicHint = async (
  imageBase64: string,
  clusters: TargetCandidate[],
  maxRow: number
): Promise<{
  hint: {
    message: string;
    rationale?: string;
    targetRow?: number;
    targetCol?: number;
    recommendedColor?: BubbleColor;
  };
  debug: DebugInfo;
}> => {
  const startTime = performance.now();
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    timestamp: new Date().toLocaleTimeString(),
  };

  // Initialize client right before use as per best practices
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const clustersJson = JSON.stringify(clusters, null, 2);
  const prompt = `
    Analyze the visual state of this bubble shooter game alongside the provided cluster data.
    Identify the most strategic move to clear the board and maximize points.
    
    Potential Targets:
    ${clustersJson}
    
    Deepest Active Row: ${maxRow}

    Respond with a tactical message, rationale, and exact target coordinates (row and col).
  `;

  debug.promptContext = prompt;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
        ]
      },
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            rationale: { type: Type.STRING },
            targetRow: { type: Type.NUMBER },
            targetCol: { type: Type.NUMBER },
            recommendedColor: { type: Type.STRING, description: "Color to equip (red, blue, green, yellow, purple, or orange)" }
          },
          required: ["message", "targetRow", "targetCol"]
        }
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    debug.rawResponse = response.text;

    try {
      const json = JSON.parse(response.text || "{}");
      debug.parsedResponse = json;
      return { hint: json, debug };
    } catch (e: any) {
      return {
        hint: { message: "Strategy parsing failed" },
        debug: { ...debug, error: `Parse error: ${e.message}` },
      };
    }
  } catch (error: any) {
    return {
      hint: { message: "Tactical engine offline" },
      debug: { ...debug, error: error.message },
    };
  }
};

// Updated getGlobeIntelligence to use the current SDK initialization and schema-based generation
export const getGlobeIntelligence = async (
  imageBase64: string,
): Promise<{ data: IntelligenceData | null; debug: DebugInfo }> => {
  const startTime = performance.now();
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    timestamp: new Date().toLocaleTimeString()
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Analyze this 3D holographic rendering of Earth. 
    Identify the continent, region, or specific country that is prominently centered.
    
    Return a structured overview of the region's context, facts, and significance.
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
        ]
      },
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            region: { type: Type.STRING },
            summary: { type: Type.STRING },
            keyFacts: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            strategicSignificance: { type: Type.STRING }
          },
          required: ["region", "summary", "keyFacts", "strategicSignificance"]
        }
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    debug.rawResponse = response.text;

    try {
        const json = JSON.parse(response.text || "{}");
        debug.parsedResponse = json;
        return { data: json as IntelligenceData, debug };
    } catch (e: any) {
        return { data: null, debug: { ...debug, error: `Parse error: ${e.message}` } };
    }
  } catch (error: any) {
    return { data: null, debug: { ...debug, error: error.message } };
  }
};

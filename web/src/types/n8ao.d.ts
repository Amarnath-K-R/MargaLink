// n8ao ships no type declarations; this covers the part the landing demo uses.
declare module "n8ao" {
  import type { Camera, Color, Scene } from "three";
  import { Pass } from "three/examples/jsm/postprocessing/Pass.js";

  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: { aoRadius: number; distanceFalloff: number; intensity: number; color: Color; halfRes: boolean };
    setQualityMode(mode: "Performance" | "Low" | "Medium" | "High" | "Ultra"): void;
  }
}

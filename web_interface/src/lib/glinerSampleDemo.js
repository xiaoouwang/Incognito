import {
  buildSampleDemoState,
  DEMO_MODEL_LABEL,
  isSampleDemoText,
} from "./sampleDemo.js";

/** Same preloaded Marie Dupont sample as Basic mode. */
export const GLINER_DEMO_MODEL_LABEL = DEMO_MODEL_LABEL;

export function buildGlinerSampleDemoState() {
  return buildSampleDemoState();
}

export function isGlinerSampleDemoText(value) {
  return isSampleDemoText(value);
}

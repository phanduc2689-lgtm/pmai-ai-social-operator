import { PmaiEngine } from "./engine.ts";

let singleton: PmaiEngine | null = null;

export function getEngine(): PmaiEngine {
  if (!singleton) singleton = new PmaiEngine({ persist: true });
  return singleton;
}

export function resetEngine(): PmaiEngine {
  singleton = new PmaiEngine({ persist: true });
  singleton.resetDemo();
  return singleton;
}

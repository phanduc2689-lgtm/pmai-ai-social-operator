import { PmaiEngine } from "./engine.ts";

let singleton: PmaiEngine | null = null;

export function getEngine(): PmaiEngine {
  if (!singleton) {
    try {
      singleton = new PmaiEngine({ persist: true });
    } catch {
      singleton = new PmaiEngine({ persist: false });
    }
  }
  return singleton;
}

export function resetEngine(): PmaiEngine {
  singleton = new PmaiEngine({ persist: true });
  singleton.resetDemo();
  return singleton;
}

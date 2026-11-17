import { createContext } from "react";

export type ZeusButtonSettings = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const ZEUS_BUTTON_ENABLED_KEY = "deception-world:zeus-button-enabled";

export const sharedZeusButtonContext =
  typeof createContext === "function" ? createContext<ZeusButtonSettings | null>(null) : null;

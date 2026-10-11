export type SideMenuEarlyInput = {
  opener: HTMLButtonElement;
  pathname: string;
  url: string;
  keyboard: boolean;
};
export function installSideMenuEarlyInput(environment?: Window): {
  valid(input: SideMenuEarlyInput): boolean;
  dispose(): void;
  claim(opener: HTMLButtonElement): SideMenuEarlyInput | null;
} | null;
export function claimSideMenuEarlyInput(
  opener: HTMLButtonElement,
  environment?: Window,
): SideMenuEarlyInput | null;
export function isSideMenuEarlyInputValid(input: SideMenuEarlyInput, environment?: Window): boolean;
export const SIDE_MENU_EARLY_INPUT_SCRIPT: string;

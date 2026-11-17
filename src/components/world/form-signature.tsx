import { isSignatureForm, type FormTheme } from "./form-signature-state";

/** Code-native ornament: the supplied artwork and all reading text stay intact. */
export function FormSignature({ theme }: { theme?: FormTheme }) {
  if (!isSignatureForm(theme)) return null;
  return (
    <div className="form-signature" aria-hidden="true">
      <span className="form-signature-seal">{theme === "explom" ? "EXPLOM" : "犭"}</span>
      <i className="form-signature-trace is-first" />
      <i className="form-signature-trace is-second" />
      <i className="form-signature-trace is-third" />
      <i className="form-signature-flare" />
    </div>
  );
}

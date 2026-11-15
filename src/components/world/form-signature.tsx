import { isSignatureForm, type FormTheme } from "./form-signature-state";

/** Code-native ornament: the supplied artwork and all reading text stay intact. */
export function FormSignature({ theme }: { theme?: FormTheme }) {
  if (!isSignatureForm(theme) && theme !== "custom") return null;
  const seal = theme === "explom" ? "EXPLOM" : theme === "kemonohen" ? "犭" : "";
  return (
    <div className="form-signature" data-signature-theme={theme} aria-hidden="true">
      <span className="form-signature-seal">{seal}</span>
      <i className="form-signature-ring" />
      <i className="form-signature-scale" />
      <i className="form-signature-trace is-first" />
      <i className="form-signature-trace is-second" />
      <i className="form-signature-trace is-third" />
      <i className="form-signature-flare" />
    </div>
  );
}

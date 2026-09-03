import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * Die beiden Seitenknöpfe des Handoffs (§ Boutons de page).
 *
 * Der primäre trägt eine Schattenkante in der Handlungsfarbe; sie ist der
 * einzige Ort im hellen Teil der Oberfläche, an dem ein farbiger Schatten
 * vorkommt, und macht ihn ohne zweite Farbe zum offensichtlichen Ziel.
 *
 * Mit `forwardRef`, weil ein Dialog den Fokus auf seine Bestätigung setzen
 * können muss: ohne Fokus im Dialog führt die Tastatur an ihm vorbei.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export const PrimaryButton = forwardRef<HTMLButtonElement, Props>(function PrimaryButton(
  { className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`whitespace-nowrap rounded-full bg-clay px-[22px] py-3 text-row font-semibold text-on-clay shadow-primary transition-colors duration-120 hover:bg-clay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-deep disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    />
  );
});

export const SecondaryButton = forwardRef<HTMLButtonElement, Props>(function SecondaryButton(
  { className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`whitespace-nowrap rounded-full border border-strong bg-inset px-5 py-3 text-row font-medium text-ink-body transition-colors duration-120 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-deep disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    />
  );
});

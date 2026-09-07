"use client";

import { useEffect, useRef } from "react";

/**
 * Rückfrage vor einer Handlung, die man nicht zurücknehmen kann.
 *
 * Das Gegenstück zur `Alert` der mobilen App (PR #66). Im Browser gibt es
 * keine Systemabfrage, die sich einbetten liesse -- `window.confirm` blockiert
 * den Faden, lässt sich nicht gestalten und wird von manchen Browsern
 * unterdrückt, wenn der Nutzer es einmal verlangt hat. Eine unterdrückte
 * Rückfrage ist schlimmer als keine: der Knopf handelt dann wieder sofort.
 *
 * Drei Dinge, die eine Rückfrage erst zu einer machen:
 *
 *   - der ABBRECHENDE Knopf bekommt den Fokus, nicht der bestätigende. Wer
 *     mit der Eingabetaste durch die Seite geht, darf sich nicht versehentlich
 *     abmelden;
 *   - Escape schliesst, wie überall im Produkt (siehe publish-action);
 *   - `aria-modal` samt Beschriftung, damit eine Sprachausgabe die Frage
 *     vorliest statt nur zwei Knöpfe zu nennen.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/40 px-4"
      // Ein Klick daneben bricht ab -- dieselbe Erwartung wie bei Escape.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-card border border-border-default bg-app p-6 shadow-app"
      >
        <h2 id="confirm-title" className="font-serif text-[22px] font-normal text-ink-primary">
          {title}
        </h2>
        <p id="confirm-body" className="mt-2 text-row text-ink-secondary">
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border-default px-[15px] py-[9px] text-row font-medium text-ink-body transition-colors duration-120 hover:bg-inset"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-clay px-[15px] py-[9px] text-row font-semibold text-on-clay transition-colors duration-120 hover:bg-clay-hover"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

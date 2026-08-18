"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { VisitCreateForm, type VisitFormSubmit } from "@/components/visit-create-form";
import { createVisit, createEmergencyVisit } from "@len-len/api-client";
import { ApiError } from "@len-len/api-client";

export default function NewVisitPage() {
  const t = useTranslations("visits.form");
  const tc = useTranslations("common");
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(submission: VisitFormSubmit) {
    setError(null);
    setSubmitting(true);
    try {
      // Notfall und Regelbesuch haben eigene Endpunkte: der Notfall umgeht
      // Wochenzyklus, Arbeitstag und Qualifikationsabgleich, verlangt dafür
      // ein Motiv.
      if (submission.emergency) {
        await createEmergencyVisit(submission.input);
      } else {
        await createVisit(submission.input);
      }
      router.replace("/visits");
    } catch (err) {
      // Bei Regelverstößen (422/409) die genaue Backend-Meldung zeigen
      // (Wochenkonflikt, kein Arbeitstag, keine Stamm-Fachkraft …).
      if (err instanceof ApiError && (err.status === 422 || err.status === 409) && err.message) {
        setError(err.message);
      } else {
        setError(tc("errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">{t("newTitle")}</h1>
      <div className="mt-4">
        <VisitCreateForm
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
          onCancel={() => router.replace("/visits")}
        />
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PatientForm, type PatientFormValues } from "@/components/patient-form";
import { createPatient } from "@/lib/api/patients";
import { listCaregivers, type Caregiver } from "@/lib/api/caregivers";
import { ApiError } from "@/lib/api/errors";

export default function NewPatientPage() {
  const t = useTranslations("patients.form");
  const tc = useTranslations("common");
  const router = useRouter();

  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listCaregivers({ pageSize: 100 })
      .then((res) => {
        if (active) setCaregivers(res.data);
      })
      .catch(() => {
        /* Sélecteur facultatif : on ignore l'échec de chargement. */
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(values: PatientFormValues) {
    setError(null);
    setSubmitting(true);
    try {
      const { assignedCaregiverId, ...rest } = values;
      await createPatient({
        ...rest,
        ...(assignedCaregiverId ? { assignedCaregiverId } : {}),
      });
      router.replace("/patients");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 402 ? t("limitReached") : tc("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">{t("newTitle")}</h1>
      <div className="mt-4">
        <PatientForm
          caregivers={caregivers}
          submitting={submitting}
          error={error}
          submitLabel={t("create")}
          onSubmit={handleSubmit}
          onCancel={() => router.replace("/patients")}
        />
      </div>
    </section>
  );
}

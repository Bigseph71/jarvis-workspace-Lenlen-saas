"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PatientForm, type PatientFormValues } from "@/components/patient-form";
import { getPatient, updatePatient } from "@/lib/api/patients";
import { listCaregivers, type Caregiver } from "@/lib/api/caregivers";

type LoadState = "loading" | "ready" | "error";

export default function EditPatientPage() {
  const t = useTranslations("patients.form");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initial, setInitial] = useState<PatientFormValues | null>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    Promise.all([getPatient(id), listCaregivers({ pageSize: 100 })])
      .then(([patient, cg]) => {
        if (!active) return;
        setInitial({
          firstName: patient.firstName,
          lastName: patient.lastName,
          rawAddress: patient.rawAddress,
          assignedCaregiverId: patient.assignedCaregiverId,
        });
        setCaregivers(cg.data);
        setLoadState("ready");
      })
      .catch(() => {
        if (active) setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(values: PatientFormValues) {
    setError(null);
    setSubmitting(true);
    try {
      await updatePatient(id, {
        firstName: values.firstName,
        lastName: values.lastName,
        rawAddress: values.rawAddress,
        assignedCaregiverId: values.assignedCaregiverId,
      });
      router.replace("/patients");
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">{t("editTitle")}</h1>
      <div className="mt-4">
        {loadState === "loading" ? (
          <p className="text-gray-400">{tc("loading")}</p>
        ) : loadState === "error" || !initial ? (
          <p className="text-red-600">{t("loadError")}</p>
        ) : (
          <PatientForm
            initial={initial}
            caregivers={caregivers}
            submitting={submitting}
            error={error}
            submitLabel={t("save")}
            onSubmit={handleSubmit}
            onCancel={() => router.replace("/patients")}
          />
        )}
      </div>
    </section>
  );
}

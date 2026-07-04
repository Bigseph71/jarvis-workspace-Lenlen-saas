"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CaregiverEditForm, type CaregiverIdentity } from "@/components/caregiver-edit-form";
import { getCaregiver, updateCaregiver } from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

export default function EditCaregiverPage() {
  const t = useTranslations("caregivers.form");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initial, setInitial] = useState<CaregiverIdentity | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    getCaregiver(id)
      .then((c) => {
        if (!active) return;
        setInitial({ firstName: c.firstName, lastName: c.lastName, qualification: c.qualification });
        setLoadState("ready");
      })
      .catch(() => {
        if (active) setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(values: CaregiverIdentity) {
    setError(null);
    setSubmitting(true);
    try {
      await updateCaregiver(id, values);
      router.replace("/caregivers");
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
          <CaregiverEditForm
            initial={initial}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
            onCancel={() => router.replace("/caregivers")}
          />
        )}
      </div>
    </section>
  );
}

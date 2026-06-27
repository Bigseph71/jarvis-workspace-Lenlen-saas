"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CaregiverCreateForm } from "@/components/caregiver-create-form";
import { createCaregiver, type CreateCaregiverInput } from "@/lib/api/caregivers";
import { ApiError } from "@/lib/api/errors";

export default function NewCaregiverPage() {
  const t = useTranslations("caregivers.form");
  const tc = useTranslations("common");
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(input: CreateCaregiverInput) {
    setError(null);
    setSubmitting(true);
    try {
      await createCaregiver(input);
      router.replace("/caregivers");
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
        <CaregiverCreateForm
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
          onCancel={() => router.replace("/caregivers")}
        />
      </div>
    </section>
  );
}

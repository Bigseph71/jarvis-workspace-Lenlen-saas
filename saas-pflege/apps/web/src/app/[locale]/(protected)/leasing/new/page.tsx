"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { VehicleForm, type VehicleFormValues } from "@/components/vehicle-form";
import { ApiError, createVehicle } from "@len-len/api-client";

export default function NewVehiclePage() {
  const t = useTranslations("leasing.form");
  const tc = useTranslations("common");
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: VehicleFormValues) {
    setError(null);
    setSubmitting(true);
    try {
      await createVehicle({
        label: values.label,
        leasingKmLimit: values.leasingKmLimit,
        leasingEndDate: values.leasingEndDate,
      });
      router.replace("/leasing");
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
        <VehicleForm
          submitting={submitting}
          error={error}
          submitLabel={t("create")}
          onSubmit={handleSubmit}
          onCancel={() => router.replace("/leasing")}
        />
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { VehicleForm, type VehicleFormValues } from "@/components/vehicle-form";
import { ApiError, getVehicle, updateVehicle } from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

export default function EditVehiclePage() {
  const t = useTranslations("leasing.form");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initial, setInitial] = useState<VehicleFormValues | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    getVehicle(id)
      .then((vehicle) => {
        if (!active) return;
        setInitial({
          label: vehicle.label,
          leasingKmLimit: vehicle.leasingKmLimit,
          // ISO -> yyyy-mm-dd für das Datumsfeld.
          leasingEndDate: vehicle.leasingEndDate ? vehicle.leasingEndDate.slice(0, 10) : null,
        });
        setLoadState("ready");
      })
      .catch(() => {
        if (active) setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(values: VehicleFormValues) {
    setError(null);
    setSubmitting(true);
    try {
      await updateVehicle(id, {
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
      <h1 className="text-2xl font-bold text-gray-900">{t("editTitle")}</h1>
      <div className="mt-4">
        {loadState === "loading" ? (
          <p className="text-gray-400">{tc("loading")}</p>
        ) : loadState === "error" || !initial ? (
          <p className="text-red-600">{t("loadError")}</p>
        ) : (
          <VehicleForm
            initial={initial}
            submitting={submitting}
            error={error}
            submitLabel={t("save")}
            onSubmit={handleSubmit}
            onCancel={() => router.replace("/leasing")}
          />
        )}
      </div>
    </section>
  );
}

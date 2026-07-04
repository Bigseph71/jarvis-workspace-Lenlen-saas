"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ContractForm } from "@/components/contract-form";
import type { ContractFieldsValue } from "@/components/contract-fields";
import { getCaregiver, updateContract, type ContractInput } from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

export default function CaregiverContractPage() {
  const t = useTranslations("caregivers.form");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initial, setInitial] = useState<ContractFieldsValue | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    getCaregiver(id)
      .then((caregiver) => {
        if (!active) return;
        setInitial({
          contractType: caregiver.contractType,
          weeklyHours: String(caregiver.weeklyHours),
          workDays: caregiver.workDays,
          maxPatients: String(caregiver.maxPatients),
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

  async function handleSubmit(input: ContractInput) {
    setError(null);
    setSubmitting(true);
    try {
      await updateContract(id, input);
      router.replace("/caregivers");
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">{t("contractTitle")}</h1>
      <div className="mt-4">
        {loadState === "loading" ? (
          <p className="text-gray-400">{tc("loading")}</p>
        ) : loadState === "error" || !initial ? (
          <p className="text-red-600">{t("loadError")}</p>
        ) : (
          <ContractForm
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

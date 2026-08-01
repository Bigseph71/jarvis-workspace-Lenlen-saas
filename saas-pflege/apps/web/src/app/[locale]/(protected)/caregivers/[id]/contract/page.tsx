"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ContractForm } from "@/components/contract-form";
import { ContractHistory } from "@/components/contract-history";
import { todayISO, type ContractFieldsValue } from "@/components/contract-fields";
import {
  ApiError,
  getCaregiver,
  listContracts,
  updateContract,
  type Contract,
  type ContractInput,
} from "@len-len/api-client";

type LoadState = "loading" | "ready" | "error";

export default function CaregiverContractPage() {
  const t = useTranslations("caregivers.form");
  const th = useTranslations("caregivers.history");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initial, setInitial] = useState<ContractFieldsValue | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [caregiver, history] = await Promise.all([
        getCaregiver(id),
        listContracts({ caregiverId: id, pageSize: 50 }),
      ]);
      setInitial({
        contractType: caregiver.contractType,
        weeklyHours: String(caregiver.weeklyHours),
        workDays: caregiver.workDays,
        maxPatients: String(caregiver.maxPatients),
        // Vorbelegt mit heute: eine Vertragsänderung gilt ab einem Stichtag,
        // und der ist im Zweifel heute.
        validFrom: todayISO(),
      });
      setContracts(history.data);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(input: ContractInput) {
    setError(null);
    setSubmitting(true);
    try {
      // Bewusst das Vertragsmodul der Fachkraft und nicht POST /hr/contracts:
      // dieser Weg schreibt den Zeitstrahl fort (laufender Vertrag endet am
      // Vortag). Der /hr-Endpoint erwartet ausdrückliche Zeiträume und lehnt
      // eine Überschneidung ab – richtig für einen Import, falsch für "ändern".
      await updateContract(id, input);
      router.replace("/caregivers");
    } catch (err) {
      // Das Backend begründet eine Ablehnung (422); diese Begründung ist für
      // den Benutzer brauchbarer als ein allgemeines "hat nicht geklappt".
      setError(
        err instanceof ApiError && (err.status === 422 || err.status === 403)
          ? err.status === 403
            ? tc("forbidden")
            : err.message
          : tc("errorGeneric"),
      );
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
          <>
            <ContractForm
              initial={initial}
              submitting={submitting}
              error={error}
              onSubmit={handleSubmit}
              onCancel={() => router.replace("/caregivers")}
            />

            <div className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">{th("title")}</h2>
              <ContractHistory contracts={contracts} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

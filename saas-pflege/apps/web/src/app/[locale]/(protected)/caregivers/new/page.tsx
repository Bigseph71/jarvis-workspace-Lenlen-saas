"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  CaregiverCreateForm,
  type CaregiverCreateSubmit,
} from "@/components/caregiver-create-form";
import { FachkraftAccessData } from "@/components/fachkraft-access-data";
import { createCaregiver, createFachkraftAccount, ApiError } from "@len-len/api-client";

interface CreatedAccount {
  email: string;
  temporaryPassword: string;
}

export default function NewCaregiverPage() {
  const t = useTranslations("caregivers.form");
  const tc = useTranslations("common");
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<CreatedAccount | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  async function handleSubmit({ caregiver, email }: CaregiverCreateSubmit) {
    setError(null);
    setSubmitting(true);

    let createdId: string;
    try {
      const created = await createCaregiver(caregiver);
      createdId = created.id;
    } catch (err) {
      setError(err instanceof ApiError && err.status === 402 ? t("limitReached") : tc("errorGeneric"));
      setSubmitting(false);
      return;
    }

    // Ohne E-Mail bleibt es bei der reinen Personalakte: kein App-Zugang.
    if (!email) {
      router.replace("/caregivers");
      return;
    }

    // Die Fachkraft steht bereits in der Datenbank. Scheitert nur das Konto
    // (z.B. E-Mail vergeben), darf das Formular nicht erneut absendbar bleiben –
    // sonst legt der Admin die Fachkraft ein zweites Mal an.
    try {
      const result = await createFachkraftAccount({ caregiverId: createdId, email });
      setAccount({ email: result.user.email, temporaryPassword: result.temporaryPassword });
    } catch (err) {
      setAccountError(
        err instanceof ApiError && err.status === 409 ? t("accountEmailTaken") : t("accountFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Fachkraft angelegt, Konto nicht: Sackgasse statt Formular, damit die
  // Fachkraft nicht doppelt entsteht.
  if (accountError) {
    return (
      <section>
        <h1 className="text-2xl font-bold text-gray-900">{t("accountFailedTitle")}</h1>
        <div className="mt-4 max-w-lg rounded-md border border-red-300 bg-red-50 p-4">
          <p role="alert" className="text-sm text-red-700">
            {accountError}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/caregivers")}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            {t("accountDone")}
          </button>
        </div>
      </section>
    );
  }

  // Erfolgsansicht: das Passwort ist nur hier sichtbar und nirgends abrufbar.
  if (account) {
    return (
      <section>
        <h1 className="text-2xl font-bold text-gray-900">{t("accountCreatedTitle")}</h1>
        <div className="mt-4 max-w-lg">
          <FachkraftAccessData
            email={account.email}
            temporaryPassword={account.temporaryPassword}
          />
          <button
            type="button"
            onClick={() => router.replace("/caregivers")}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            {t("accountDone")}
          </button>
        </div>
      </section>
    );
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

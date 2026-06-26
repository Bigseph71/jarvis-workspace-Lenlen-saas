"""Len Len – KI-Microservice (FastAPI).

Drei netzwerkisolierte Modelle, nur über internes REST erreichbar:
  - Prognose Leasing  (Prophet / XGBoost)
  - Ermüdungsscore    (scikit-learn)
  - Amélioration continue (VRPTW-Score / Parameter-Tuning)

Governance: Modelle versioniert, auditierbar, erst nach >= 6 Monaten Daten
aktiv. Nie autonome Aktionen, immer Vorschlag zur Koordinator-Freigabe.
"""

from datetime import datetime, timezone

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Len Len KI-Service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ki-service",
        "ts": datetime.now(timezone.utc).isoformat(),
    }


class LeasingInput(BaseModel):
    km_history: list[float]
    patient_growth: float
    seasonality: list[float] | None = None


class LeasingPrediction(BaseModel):
    overrun_probability: float
    estimated_date: str | None
    recommendation: str


@app.post("/predict/leasing", response_model=LeasingPrediction)
def predict_leasing(_payload: LeasingInput) -> LeasingPrediction:
    # TODO Phase 3: echtes Modell laden und inferieren
    return LeasingPrediction(
        overrun_probability=0.0,
        estimated_date=None,
        recommendation="Modell noch nicht trainiert (>= 6 Monate Daten nötig).",
    )


class FatigueInput(BaseModel):
    visits_per_week: int
    avg_duration_min: float
    total_travel_min: float
    overload_history: list[float] | None = None


class FatigueScore(BaseModel):
    score: float  # 0-100
    overload_risk: bool
    suggested_redistribution: str


@app.post("/predict/fatigue", response_model=FatigueScore)
def predict_fatigue(_payload: FatigueInput) -> FatigueScore:
    # TODO Phase 3
    return FatigueScore(score=0.0, overload_risk=False, suggested_redistribution="-")

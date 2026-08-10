/**
 * Jeu de démonstration – données fixes.
 *
 * Séparé de la logique de chargement (seed-demo.ts) pour une raison simple :
 * ce fichier se relit et se corrige sans rien comprendre au chargement, et le
 * chargement se relit sans être noyé sous quinze adresses.
 *
 * ── Ce que ce jeu doit montrer ────────────────────────────────────────────
 * Il n'est pas là pour remplir des tables, mais pour que chaque règle métier
 * du cahier des charges ait un cas visible à l'écran :
 *
 *   Règle 1 (1 visite/semaine)  chaque patient a exactement une visite régulière
 *   Règle 2 (urgence)           une visite hors cycle, motif obligatoire
 *   Règle 3 (alerte)            un patient délibérément sans visite cette semaine
 *   Règle 4 (remplacement)      trois remplacements, tous à qualification égale
 *   Règle 5 (contrats)          quatre types de contrat, jours travaillés respectés
 *   Règle 6 (leasing)           trois véhicules, km différents, tournée longue au moins usé
 *   Règle 7 (geocodage)         une adresse INVALID qui bloquera le VRPTW
 *
 * ── Les coordonnées ───────────────────────────────────────────────────────
 * Les rues sont réelles (Heidelberg), les coordonnées sont de niveau QUARTIER,
 * pas de niveau numéro de rue : elles placent le patient dans le bon secteur à
 * quelques centaines de mètres près. C'est assez pour une carte et pour des
 * distances de tournée plausibles, pas pour de la navigation.
 *
 * Ce n'est donc PAS un substitut au geocodage : `geocodingScore` vaut 0.80,
 * ce qui correspond chez Google à un centroïde de voie et non à un toit
 * (ROOFTOP = 1.0). Pour obtenir de vraies coordonnées, lancer le geocodage sur
 * l'organisation après le chargement – il écrasera ces valeurs.
 */

import {
  AbsenceStatus,
  AbsenceType,
  ContractType,
  GeocodingStatus,
  Qualification,
  UserRole,
} from "@len-len/database";
import type { WeekDay } from "../../lib/week.js";

// ── Fachkräfte ────────────────────────────────────────────────────────────

export interface DemoCaregiver {
  /** Clé stable : sert à dériver l'UUID, ne jamais la changer après un chargement. */
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  qualification: Qualification;
  contractType: ContractType;
  weeklyHours: number;
  workDays: WeekDay[];
  maxPatients: number;
  /** Date d'entrée : date d'effet du contrat initial. */
  hiredOn: string;
  /**
   * Einwilligung GPS accordée. Lena ne l'a pas donnée – c'est volontaire :
   * le tracking doit alors ne rien collecter la concernant, et la
   * démonstration montre que le refus est possible et sans conséquence sur
   * le reste (ses visites et ses pointages horaires existent quand même).
   */
  gpsConsent: boolean;
}

/**
 * Trois PFLEGEFACHKRAFT et deux PFLEGEHILFSKRAFT.
 *
 * Cette répartition n'est pas décorative : la règle 4 impose qu'un
 * remplacement ait la MÊME qualification. Avec une seule fachkraft par
 * qualification, aucune absence ne serait remplaçable et la démonstration
 * montrerait un mur au lieu d'un mécanisme.
 */
export const CAREGIVERS: readonly DemoCaregiver[] = [
  {
    slug: "anna-baumgartner",
    firstName: "Anna",
    lastName: "Baumgartner",
    email: "anna.baumgartner@demo-pflege-hd.de",
    qualification: Qualification.PFLEGEFACHKRAFT,
    contractType: ContractType.FULL_100,
    weeklyHours: 40,
    workDays: ["MON", "TUE", "WED", "THU", "FRI"],
    maxPatients: 12,
    hiredOn: "2021-03-01",
    gpsConsent: true,
  },
  {
    slug: "sofia-richter",
    firstName: "Sofia",
    lastName: "Richter",
    email: "sofia.richter@demo-pflege-hd.de",
    qualification: Qualification.PFLEGEFACHKRAFT,
    contractType: ContractType.PART_80,
    weeklyHours: 32,
    workDays: ["MON", "TUE", "WED", "THU"],
    maxPatients: 10,
    hiredOn: "2022-09-15",
    gpsConsent: true,
  },
  {
    slug: "markus-weber",
    firstName: "Markus",
    lastName: "Weber",
    email: "markus.weber@demo-pflege-hd.de",
    qualification: Qualification.PFLEGEFACHKRAFT,
    contractType: ContractType.PART_50,
    weeklyHours: 20,
    workDays: ["MON", "WED", "FRI"],
    maxPatients: 6,
    hiredOn: "2023-01-09",
    gpsConsent: true,
  },
  {
    slug: "yusuf-demir",
    firstName: "Yusuf",
    lastName: "Demir",
    email: "yusuf.demir@demo-pflege-hd.de",
    qualification: Qualification.PFLEGEHILFSKRAFT,
    contractType: ContractType.FULL_100,
    weeklyHours: 40,
    workDays: ["MON", "TUE", "WED", "THU", "FRI"],
    maxPatients: 12,
    hiredOn: "2020-06-01",
    gpsConsent: true,
  },
  {
    slug: "lena-hoffmann",
    firstName: "Lena",
    lastName: "Hoffmann",
    email: "lena.hoffmann@demo-pflege-hd.de",
    qualification: Qualification.PFLEGEHILFSKRAFT,
    contractType: ContractType.MINIJOB,
    weeklyHours: 10,
    workDays: ["TUE", "THU"],
    maxPatients: 4,
    hiredOn: "2025-04-01",
    gpsConsent: false,
  },
] as const;

// ── Comptes non soignants ─────────────────────────────────────────────────

export interface DemoUser {
  slug: string;
  email: string;
  role: UserRole;
}

/**
 * Un compte par rôle, pour montrer le RBAC en séance : le Koordinator ne voit
 * pas le billing, le HR ne voit aucune donnée patient.
 */
export const STAFF_USERS: readonly DemoUser[] = [
  { slug: "admin", email: "admin@demo-pflege-hd.de", role: UserRole.STRUKTUR_ADMIN },
  { slug: "koordinator", email: "koordination@demo-pflege-hd.de", role: UserRole.KOORDINATOR },
  { slug: "hr", email: "personal@demo-pflege-hd.de", role: UserRole.HR },
] as const;

// ── Patients ──────────────────────────────────────────────────────────────

export interface DemoPatient {
  slug: string;
  firstName: string;
  lastName: string;
  /** Rue réelle de Heidelberg. */
  address: string;
  /** Quartier – sert à expliquer la géographie des tournées, pas stocké. */
  district: string;
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: GeocodingStatus;
  /** Fachkraft attitrée (slug). */
  assignedTo: string;
  /** Jour de la visite hebdomadaire régulière. */
  visitDay: WeekDay;
  /** Heure locale de la visite, en minutes depuis minuit. */
  visitMinute: number;
}

const H = (hour: number, minute = 0): number => hour * 60 + minute;

/**
 * Quinze patients, regroupés géographiquement par fachkraft attitrée.
 *
 * Le regroupement est ce qui rend les tournées crédibles : Anna couvre le nord
 * (Handschuhsheim, Neuenheim, Ziegelhausen, Schlierbach), donc de longues
 * distances ; Sofia le centre, donc des tournées courtes. Sans cela, les km
 * calculés par tournée seraient du bruit et la règle leasing n'aurait rien à
 * arbitrer.
 */
export const PATIENTS: readonly DemoPatient[] = [
  // Anna Baumgartner – nord de la ville, tournées longues
  {
    slug: "gertrud-schaefer",
    firstName: "Gertrud",
    lastName: "Schäfer",
    address: "Dossenheimer Landstraße 42, 69121 Heidelberg",
    district: "Handschuhsheim",
    latitude: 49.4304,
    longitude: 8.6772,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "anna-baumgartner",
    visitDay: "MON",
    visitMinute: H(8),
  },
  {
    slug: "wilhelm-krause",
    firstName: "Wilhelm",
    lastName: "Krause",
    address: "Ladenburger Straße 18, 69120 Heidelberg",
    district: "Neuenheim",
    latitude: 49.4192,
    longitude: 8.6873,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "anna-baumgartner",
    visitDay: "TUE",
    visitMinute: H(8),
  },
  {
    slug: "ingrid-vogt",
    firstName: "Ingrid",
    lastName: "Vogt",
    address: "Kleingemünder Straße 7, 69118 Heidelberg",
    district: "Ziegelhausen",
    latitude: 49.421,
    longitude: 8.7473,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "anna-baumgartner",
    visitDay: "WED",
    visitMinute: H(9, 30),
  },
  {
    slug: "hermann-lange",
    firstName: "Hermann",
    lastName: "Lange",
    address: "Schlierbacher Landstraße 116, 69118 Heidelberg",
    district: "Schlierbach",
    latitude: 49.4048,
    longitude: 8.7418,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "anna-baumgartner",
    visitDay: "THU",
    visitMinute: H(9, 30),
  },

  // Sofia Richter – centre, tournées courtes
  {
    slug: "elisabeth-hoffmann",
    firstName: "Elisabeth",
    lastName: "Hoffmann",
    address: "Hauptstraße 87, 69117 Heidelberg",
    district: "Altstadt",
    latitude: 49.4124,
    longitude: 8.7089,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "sofia-richter",
    visitDay: "MON",
    visitMinute: H(9, 30),
  },
  {
    slug: "karl-heinz-boehm",
    firstName: "Karl-Heinz",
    lastName: "Böhm",
    address: "Bergheimer Straße 104, 69115 Heidelberg",
    district: "Bergheim",
    latitude: 49.4085,
    longitude: 8.6819,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "sofia-richter",
    visitDay: "TUE",
    visitMinute: H(9, 30),
  },
  {
    slug: "margarete-simon",
    firstName: "Margarete",
    lastName: "Simon",
    address: "Blumenstraße 21, 69115 Heidelberg",
    district: "Weststadt",
    latitude: 49.4038,
    longitude: 8.6862,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "sofia-richter",
    visitDay: "WED",
    visitMinute: H(8),
  },

  // Markus Weber – sud
  {
    slug: "ottmar-fuchs",
    firstName: "Ottmar",
    lastName: "Fuchs",
    address: "Karlsruher Straße 63, 69126 Heidelberg",
    district: "Rohrbach",
    latitude: 49.3771,
    longitude: 8.6808,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "markus-weber",
    visitDay: "MON",
    visitMinute: H(11),
  },
  {
    slug: "helga-neumann",
    firstName: "Helga",
    lastName: "Neumann",
    address: "Im Bosseldorn 14, 69126 Heidelberg",
    district: "Boxberg",
    latitude: 49.3796,
    longitude: 8.7014,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "markus-weber",
    visitDay: "WED",
    visitMinute: H(11),
  },
  {
    // Le patient de la règle 3 : sa visite du vendredi n'est PAS créée cette
    // semaine (voir UNPLANNED_THIS_WEEK). L'alerte du tableau de bord a donc
    // quelque chose à signaler, ce qui vaut mieux qu'un écran vide dont on ne
    // sait pas s'il marche.
    slug: "rudolf-seifert",
    firstName: "Rudolf",
    lastName: "Seifert",
    address: "Emmertsgrundpassage 5, 69126 Heidelberg",
    district: "Emmertsgrund",
    latitude: 49.3722,
    longitude: 8.6941,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "markus-weber",
    visitDay: "FRI",
    visitMinute: H(8),
  },

  // Yusuf Demir – ouest
  {
    slug: "anneliese-bauer",
    firstName: "Anneliese",
    lastName: "Bauer",
    address: "Mannheimer Straße 259, 69123 Heidelberg",
    district: "Wieblingen",
    latitude: 49.4185,
    longitude: 8.6438,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "yusuf-demir",
    visitDay: "MON",
    visitMinute: H(13, 30),
  },
  {
    slug: "josef-wagner",
    firstName: "Josef",
    lastName: "Wagner",
    address: "Kranichweg 12, 69123 Heidelberg",
    district: "Pfaffengrund",
    latitude: 49.3947,
    longitude: 8.6462,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "yusuf-demir",
    visitDay: "TUE",
    visitMinute: H(13, 30),
  },
  {
    // Le cas de la règle 7. L'adresse est volontairement inexploitable : un
    // numéro qui n'existe pas et un complément que le geocodeur ne sait pas
    // lever. Résultat attendu en séance : l'optimisation VRPTW REFUSE de
    // partir tant que ce patient n'est pas corrigé.
    slug: "hildegard-roth",
    firstName: "Hildegard",
    lastName: "Roth",
    address: "Schwetzinger Straße 9999, Hinterhaus, Heidelberg",
    district: "Kirchheim",
    latitude: null,
    longitude: null,
    geocodingStatus: GeocodingStatus.INVALID,
    assignedTo: "yusuf-demir",
    visitDay: "THU",
    visitMinute: H(13, 30),
  },

  // Lena Hoffmann – centre / Bahnstadt
  {
    slug: "erna-zimmermann",
    firstName: "Erna",
    lastName: "Zimmermann",
    address: "Gadamerplatz 3, 69115 Heidelberg",
    district: "Bahnstadt",
    latitude: 49.4028,
    longitude: 8.6659,
    geocodingStatus: GeocodingStatus.VALID,
    assignedTo: "lena-hoffmann",
    visitDay: "TUE",
    visitMinute: H(15),
  },
  {
    // Patient tout juste enregistré : le geocodage n'a pas encore tourné.
    // Montre l'état PENDING, qui n'est ni une erreur ni un blocage.
    slug: "friedrich-albrecht",
    firstName: "Friedrich",
    lastName: "Albrecht",
    address: "Rohrbacher Straße 45, 69115 Heidelberg",
    district: "Weststadt",
    latitude: null,
    longitude: null,
    geocodingStatus: GeocodingStatus.PENDING,
    assignedTo: "lena-hoffmann",
    visitDay: "THU",
    visitMinute: H(15),
  },
] as const;

/** Patients dont la visite régulière n'est PAS créée dans la semaine courante. */
export const UNPLANNED_THIS_WEEK: readonly string[] = ["rudolf-seifert"];

// ── Absences de la semaine courante ───────────────────────────────────────

export interface DemoAbsence {
  slug: string;
  caregiver: string;
  type: AbsenceType;
  status: AbsenceStatus;
  /** Décalage en jours depuis le lundi de la semaine visée. */
  fromDayOffset: number;
  toDayOffset: number;
  reason: string | null;
  /** Semaine visée : 0 = semaine courante, 1 = suivante. */
  weekOffset: number;
}

export const ABSENCES: readonly DemoAbsence[] = [
  {
    // Congé validé : c'est lui qui déclenche deux des trois remplacements.
    slug: "anna-urlaub",
    caregiver: "anna-baumgartner",
    type: AbsenceType.VACATION,
    status: AbsenceStatus.APPROVED,
    fromDayOffset: 2, // mercredi
    toDayOffset: 4, // vendredi
    reason: "Jahresurlaub",
    weekOffset: 0,
  },
  {
    // Arrêt maladie d'un jour : le cas fréquent, celui qui casse une tournée
    // du jour au lendemain et que la coordination doit absorber le matin même.
    slug: "yusuf-krank",
    caregiver: "yusuf-demir",
    type: AbsenceType.SICK,
    status: AbsenceStatus.APPROVED,
    fromDayOffset: 1, // mardi
    toDayOffset: 1,
    reason: "Krankmeldung, ärztliches Attest liegt vor",
    weekOffset: 0,
  },
  {
    // Demande NON décidée : montre que le circuit de validation existe et
    // qu'une demande en attente ne bloque pas la planification.
    slug: "lena-fortbildung",
    caregiver: "lena-hoffmann",
    type: AbsenceType.TRAINING,
    status: AbsenceStatus.REQUESTED,
    fromDayOffset: 3, // jeudi
    toDayOffset: 3,
    reason: "Fortbildung Demenzbegleitung",
    weekOffset: 1,
  },
] as const;

// ── Remplacements de la semaine courante ──────────────────────────────────

export interface DemoReplacement {
  /** Patient dont la visite est reprise. */
  patient: string;
  /** Fachkraft qui exécute effectivement (l'attitrée reste inchangée). */
  performedBy: string;
  motive: string;
}

/**
 * Les trois remplacements. Le chargeur VÉRIFIE pour chacun que la
 * qualification correspond (règle 4) et que le jour est bien un jour travaillé
 * du remplaçant (règle 5) : une donnée de démonstration qui violerait une
 * règle que le produit est censé faire respecter serait pire qu'aucune donnée.
 */
export const REPLACEMENTS: readonly DemoReplacement[] = [
  { patient: "ingrid-vogt", performedBy: "markus-weber", motive: "Urlaubsvertretung" },
  { patient: "hermann-lange", performedBy: "sofia-richter", motive: "Urlaubsvertretung" },
  { patient: "josef-wagner", performedBy: "lena-hoffmann", motive: "Krankheitsvertretung" },
] as const;

// ── Visite d'urgence (règle 2) ────────────────────────────────────────────

export const EMERGENCY = {
  patient: "elisabeth-hoffmann",
  performedBy: "sofia-richter",
  dayOffset: 2, // mercredi
  minute: H(17),
  reason: "Sturz in der Wohnung – Kontrolle der Wundversorgung",
} as const;

// ── Véhicules (règle 6) ───────────────────────────────────────────────────

export interface DemoVehicle {
  slug: string;
  label: string;
  leasingKmLimit: number;
  leasingKmUsed: number;
  leasingEndDate: string;
}

/**
 * Trois véhicules aux compteurs volontairement très différents.
 *
 * C'est la condition pour que la règle 6 (« le véhicule le moins roulé prend
 * les trajets les plus longs ») ait un effet observable : avec trois compteurs
 * proches, l'arbitrage existerait sans se voir. HD-PF 101 est en outre proche
 * de son plafond, ce qui donne au module leasing une alerte à afficher.
 */
export const VEHICLES: readonly DemoVehicle[] = [
  {
    slug: "hd-pf-101",
    label: "HD-PF 101 (VW Caddy)",
    leasingKmLimit: 30_000,
    leasingKmUsed: 24_800,
    leasingEndDate: "2027-03-31",
  },
  {
    slug: "hd-pf-202",
    label: "HD-PF 202 (Opel Corsa)",
    leasingKmLimit: 30_000,
    leasingKmUsed: 12_400,
    leasingEndDate: "2027-09-30",
  },
  {
    slug: "hd-pf-303",
    label: "HD-PF 303 (Renault Zoe)",
    leasingKmLimit: 25_000,
    leasingKmUsed: 6_100,
    leasingEndDate: "2028-01-31",
  },
] as const;

// ── Point de départ des tournées ──────────────────────────────────────────

/**
 * Siège de la structure : départ et retour de chaque tournée. Sans lui, les km
 * d'une tournée d'un seul patient vaudraient zéro, ce qui est faux et rendrait
 * l'arbitrage leasing incompréhensible.
 */
export const HOME_BASE = {
  address: "Kurfürsten-Anlage 62, 69115 Heidelberg",
  latitude: 49.4074,
  longitude: 8.6845,
} as const;

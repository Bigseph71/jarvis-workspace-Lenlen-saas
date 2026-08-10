import { z } from "zod";

/**
 * Entrée de POST /clustering/daily.
 *
 * L'organisation ne figure PAS dans le schéma : elle vient du JWT et de lui
 * seul. L'accepter dans le corps de la requête offrirait à un client la
 * possibilité de désigner un autre tenant, et il ne resterait que la RLS entre
 * cette requête et une fuite entre structures. Un paramètre qu'on n'accepte
 * pas est un paramètre qu'on n'a pas à valider.
 */
export const dailyClusteringSchema = z
  .object({
    /** Jour à découper, au format YYYY-MM-DD. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format YYYY-MM-DD")
      .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "date invalide"),

    algorithm: z.enum(["dbscan", "kmeans"]).default("dbscan"),

    /** Nombre de secteurs voulu. Obligatoire pour k-means, interdit sinon. */
    k: z.number().int().positive().max(50).optional(),

    /** Rayon de voisinage DBSCAN, en km. */
    epsilonKm: z.number().positive().max(100).optional(),

    /** Taille minimale d'un noyau DBSCAN. */
    minPoints: z.number().int().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    // k-means ne peut pas deviner le nombre de secteurs : sans k il n'a pas de
    // valeur par défaut défendable, et en inventer une reviendrait à décider à
    // la place de la coordination combien de fachkräfte elle envoie ce jour-là.
    if (value.algorithm === "kmeans" && value.k === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["k"],
        message: "k ist bei algorithm=kmeans erforderlich",
      });
    }
    // Refuser plutôt qu'ignorer : un paramètre silencieusement écarté fait
    // croire à un réglage qui n'a jamais pris effet.
    if (value.algorithm === "dbscan" && value.k !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["k"],
        message: "k gilt nur für algorithm=kmeans",
      });
    }
    if (value.algorithm === "kmeans" && (value.epsilonKm !== undefined || value.minPoints !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["epsilonKm"],
        message: "epsilonKm und minPoints gelten nur für algorithm=dbscan",
      });
    }
  });

export type DailyClusteringInput = z.infer<typeof dailyClusteringSchema>;

/** Query du flux WebSocket de statut. */
export const clusteringSocketQuerySchema = z.object({
  token: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

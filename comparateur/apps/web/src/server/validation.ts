import { z } from 'zod';

/** Schémas de validation des entrées de l'API publique (toute entrée est non fiable). */

const id = z.string().regex(/^[a-z0-9][a-z0-9:_./-]{0,99}$/i, 'identifiant invalide');
const chainId = z.string().regex(/^[a-z0-9-]{2,20}$/);

export const coordinates = z.object({
  lat: z.number().min(45.7).max(47.9),
  lon: z.number().min(5.8).max(10.6),
});

export const radiusSchema = z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)]);

export const localityQuery = z.object({
  q: z.string().trim().min(1).max(60),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const storesQuery = z.object({
  lat: z.coerce.number().min(45.7).max(47.9),
  lon: z.coerce.number().min(5.8).max(10.6),
  radius: z.coerce.number().pipe(radiusSchema),
});

export const productsQuery = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  ids: z.string().max(4000).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(30),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const compareSchema = z.object({
  origin: coordinates.extend({ label: z.string().max(100).optional() }),
  radiusKm: radiusSchema,
  chains: z.array(chainId).max(20).optional(),
  excludedStores: z.array(id).max(500).optional(),
  lines: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        productId: id,
        qty: z.number().int().min(1).max(99),
        prefs: z.object({ organic: z.boolean().optional(), swissOrigin: z.boolean().optional() }).optional(),
      }),
    )
    .min(1)
    .max(100),
  prefs: z
    .object({
      organicOnly: z.boolean(),
      swissOnly: z.boolean(),
      loyaltyPrograms: z.array(z.string().regex(/^[a-z0-9-]{2,20}$/)).max(10),
      allowSimilarPacks: z.boolean(),
      includeStalePrices: z.boolean(),
    })
    .partial()
    .optional(),
  when: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('now') }),
    z.object({ mode: z.literal('plan'), date: isoDate, time: hhmm.nullable().optional() }),
  ]),
  maxStores: z.number().int().min(1).max(5).nullable(),
  travel: z
    .object({
      mode: z.enum(['car', 'bike', 'foot', 'transit']),
      costPerKmChf: z.number().min(0).max(5),
      valueOfTimeChfPerHour: z.number().min(0).max(300),
      valueInStoreTime: z.boolean(),
      minutesPerStore: z.number().int().min(0).max(120),
      returnToOrigin: z.boolean(),
    })
    .partial()
    .optional(),
  minSavingPerExtraStoreChf: z.number().min(0).max(100).optional(),
  referenceChainId: chainId.nullable().optional(),
});

export type CompareInput = z.infer<typeof compareSchema>;

export function issues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

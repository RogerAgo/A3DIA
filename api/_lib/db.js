import { Redis } from '@upstash/redis';

export function getDB() {
  // Compatible avec l'intégration Vercel Marketplace (KV_REST_API_*)
  // ET avec les variables Upstash natives (UPSTASH_REDIS_REST_*).
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Variables manquantes : définir UPSTASH_REDIS_REST_URL/KV_REST_API_URL ' +
      'et UPSTASH_REDIS_REST_TOKEN/KV_REST_API_TOKEN.'
    );
  }

  return new Redis({ url, token });
}

import { Redis } from '@upstash/redis';

export function getDB() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Variables manquantes : UPSTASH_REDIS_REST_URL et/ou UPSTASH_REDIS_REST_TOKEN ' +
      'ne sont pas définies dans les variables d\'environnement Vercel.'
    );
  }

  return new Redis({ url, token });
}

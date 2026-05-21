/**
 * Endpoint de diagnostic — vérifie que toutes les variables d'environnement
 * requises sont bien présentes. Ne révèle jamais les valeurs, seulement leur présence.
 * À supprimer une fois le site en production stable.
 */
export default function handler(req, res) {
  const checks = {
    UPSTASH_REDIS_REST_URL:   !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    JWT_SECRET:               !!process.env.JWT_SECRET,
    ADMIN_EMAIL:              !!process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD:           !!process.env.ADMIN_PASSWORD,
  };

  const allOk = Object.values(checks).every(Boolean);
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);

  return res.status(allOk ? 200 : 500).json({
    ok: allOk,
    checks,
    missing: allOk ? [] : missing,
    message: allOk
      ? 'Toutes les variables sont présentes. Vous pouvez appeler POST /api/admin/setup.'
      : `Variables manquantes : ${missing.join(', ')}. Ajoutez-les dans Vercel > Settings > Environment Variables, puis redéployez.`
  });
}

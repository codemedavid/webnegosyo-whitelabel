/**
 * Trust the platform's Supabase as the JWT issuer.
 *
 * The values are real, not placeholders: the deploy pipeline pushes a
 * pre-built bundle and sets no environment variables on the deployment, so
 * a `process.env` fallback of "placeholder.supabase.co" was what every store
 * actually ran with — and no token could ever verify. The platform has one
 * Supabase project, its URL is public (it ships in every storefront), and
 * it signs with ES256 keys published at the JWKS URL below.
 */
const PLATFORM_SUPABASE_URL = "https://tjcmkstsuhqdwkfdrxan.supabase.co";

const config = {
  providers: [
    {
      type: "customJwt" as const,
      issuer: process.env.SUPABASE_ISSUER ?? `${PLATFORM_SUPABASE_URL}/auth/v1`,
      jwks: process.env.SUPABASE_JWKS ?? `${PLATFORM_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      algorithm: "ES256" as const,
      applicationID: "authenticated",
    },
  ],
};

export default config;

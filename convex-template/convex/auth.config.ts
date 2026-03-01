const config = {
  providers: [
    {
      type: "customJwt" as const,
      issuer: process.env.SUPABASE_ISSUER ?? "https://placeholder.supabase.co/auth/v1",
      jwks: process.env.SUPABASE_JWKS ?? "https://placeholder.supabase.co/auth/v1/.well-known/jwks.json",
      algorithm: "ES256" as const,
      applicationID: "authenticated",
    },
  ],
};

export default config;

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const CONVEX_TEMPLATE_DIR = path.join(process.cwd(), "convex-template");
const CURRENT_SCHEMA_VERSION = 1;

interface DeployResult {
  success: boolean;
  error?: string;
  schemaVersion: number;
}

export async function deployConvexSchema(
  deployKey: string
): Promise<DeployResult> {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseIssuer = supabaseUrl
      ? `${supabaseUrl}/auth/v1`
      : "";
    const supabaseJwks = supabaseUrl
      ? `${supabaseUrl}/auth/v1/.well-known/jwks.json`
      : "";

    const { stderr } = await execAsync(
      `npx convex deploy --cmd 'echo deployed'`,
      {
        cwd: CONVEX_TEMPLATE_DIR,
        timeout: 120000,
        env: {
          ...process.env,
          CONVEX_DEPLOY_KEY: deployKey,
          SUPABASE_ISSUER: supabaseIssuer,
          SUPABASE_JWKS: supabaseJwks,
        },
      }
    );

    if (stderr && stderr.toLowerCase().includes("error")) {
      return { success: false, error: stderr, schemaVersion: 0 };
    }

    return { success: true, schemaVersion: CURRENT_SCHEMA_VERSION };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown deployment error";
    return { success: false, error: message, schemaVersion: 0 };
  }
}

export async function validateConvexCredentials(
  deploymentUrl: string,
  deployKey: string
): Promise<boolean> {
  try {
    const response = await fetch(`${deploymentUrl}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${deployKey}`,
      },
      body: JSON.stringify({
        path: "nonexistent:query",
        args: {},
        format: "json",
      }),
    });

    // 400 (function not found) = credentials valid
    // 401/403 = credentials invalid
    return response.status !== 401 && response.status !== 403;
  } catch {
    return false;
  }
}

export async function syncTenantConfig(
  deploymentUrl: string,
  deployKey: string,
  configs: Record<string, string>
): Promise<boolean> {
  try {
    for (const [key, value] of Object.entries(configs)) {
      const response = await fetch(`${deploymentUrl}/api/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
        body: JSON.stringify({
          path: "config:upsertConfig",
          args: { key, value },
          format: "json",
        }),
      });

      if (!response.ok) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export { CURRENT_SCHEMA_VERSION };

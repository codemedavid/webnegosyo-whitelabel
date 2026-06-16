"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, SectionHeader } from "@/components/superadmin/ui/primitives";
import { bulkDeployConvexAction } from "@/app/actions/convex";

export function BulkDeployButton() {
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    updated?: number;
    errors?: string[];
  } | null>(null);

  const handleDeploy = async () => {
    setDeploying(true);
    setResult(null);
    try {
      const res = await bulkDeployConvexAction();
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      });
    }
    setDeploying(false);
  };

  const hasErrors = !!result?.errors && result.errors.length > 0;
  const isOk = !!result?.success && !hasErrors;
  const isPartial = !!result?.success && hasErrors;

  return (
    <Panel>
      <SectionHeader
        icon={Rocket}
        title="Convex Deployment"
        subtitle="Push the latest Convex functions to tenants on an outdated schema version."
      />

      <div className="mt-5 space-y-4">
        <Button
          onClick={handleDeploy}
          disabled={deploying}
          className="w-full bg-white text-black hover:bg-white/90 sm:w-auto"
        >
          {deploying ? (
            <>
              <Rocket className="mr-2 h-4 w-4 animate-pulse" />
              Deploying…
            </>
          ) : (
            <>
              <Rocket className="mr-2 h-4 w-4" />
              Bulk deploy to all tenants
            </>
          )}
        </Button>

        {result && (
          <div
            className={`rounded-xl border p-4 text-sm ${
              isOk
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                : isPartial
                  ? "border-amber-400/20 bg-amber-400/10 text-amber-400"
                  : "border-red-400/20 bg-red-400/10 text-red-400"
            }`}
          >
            {result.success ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  {isPartial ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Updated {result.updated ?? 0} tenant
                  {(result.updated ?? 0) !== 1 ? "s" : ""}
                  {isPartial ? " with warnings" : ""}
                </p>
                {hasErrors && (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                    {result.errors!.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {result.errors?.[0] ?? "Deployment failed"}
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

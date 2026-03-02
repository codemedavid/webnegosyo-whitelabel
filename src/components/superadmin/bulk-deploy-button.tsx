"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket } from "lucide-react";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Convex Deployment</CardTitle>
        <Rocket className="h-4 w-4 text-violet-600" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Deploy latest Convex functions to all tenants with outdated schema versions.
        </p>
        <Button onClick={handleDeploy} disabled={deploying} className="w-full">
          {deploying ? "Deploying..." : "Bulk Deploy to All Tenants"}
        </Button>
        {result && (
          <div
            className={`rounded-md p-3 text-sm ${
              result.success && (!result.errors || result.errors.length === 0)
                ? "bg-green-50 text-green-800"
                : result.errors && result.errors.length > 0
                  ? "bg-yellow-50 text-yellow-800"
                  : "bg-red-50 text-red-800"
            }`}
          >
            {result.success ? (
              <>
                <p className="font-medium">
                  Updated {result.updated ?? 0} tenant{(result.updated ?? 0) !== 1 ? "s" : ""}
                </p>
                {result.errors && result.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>{result.errors?.[0] ?? "Deployment failed"}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  DOMAIN_DESCRIPTIONS,
  DOMAIN_ROOTS,
  DomainKey,
  resolveDomainRoots,
  resolveRepoRoot
} from "./domains.js";

const repoRoot = resolveRepoRoot(import.meta.url);

const server = new Server(
  {
    name: "whitelabel-mcp",
    version: "0.1.0"
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    }
  }
);

const ResourceUriSchema = z.object({
  uri: z.string()
});

const ReadFileInputSchema = z.object({
  path: z.string().min(1)
});

const ListDomainInputSchema = z.object({
  domain: z.enum([
    "ui",
    "functions",
    "tenants",
    "admin",
    "superadmin",
    "api"
  ])
});

type ResourceDescriptor = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
};

const domainResources: ResourceDescriptor[] = Object.keys(DOMAIN_ROOTS).map((key) => {
  const domain = key as DomainKey;
  return {
    uri: `domain://${domain}`,
    name: `${domain} domain map`,
    description: DOMAIN_DESCRIPTIONS[domain],
    mimeType: "application/json"
  };
});

function isPathWithinRoots(targetPath: string, roots: string[]): boolean {
  return roots.some((root) => {
    const relative = path.relative(root, targetPath);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: domainResources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const parsed = ResourceUriSchema.safeParse(request);
  if (!parsed.success) {
    throw new Error("Invalid resource request");
  }

  const match = parsed.data.uri.match(/^domain:\/\/(.+)$/);
  if (!match) {
    throw new Error(`Unsupported resource URI: ${parsed.data.uri}`);
  }

  const domain = match[1] as DomainKey;
  if (!DOMAIN_ROOTS[domain]) {
    throw new Error(`Unknown domain: ${domain}`);
  }

  const roots = resolveDomainRoots(repoRoot, domain);
  const payload = {
    domain,
    description: DOMAIN_DESCRIPTIONS[domain],
    repoRoot,
    roots
  };

  return {
    contents: [
      {
        uri: parsed.data.uri,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_domain_roots",
        description: "Return repo-relative roots for a given domain.",
        inputSchema: ListDomainInputSchema
      },
      {
        name: "read_domain_file",
        description: "Read a file that belongs to one of the allowed domain roots.",
        inputSchema: ReadFileInputSchema
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_domain_roots") {
    const parsed = ListDomainInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error("Invalid list_domain_roots input");
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              domain: parsed.data.domain,
              roots: DOMAIN_ROOTS[parsed.data.domain]
            },
            null,
            2
          )
        }
      ]
    };
  }

  if (name === "read_domain_file") {
    const parsed = ReadFileInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error("Invalid read_domain_file input");
    }

    const fullPath = path.resolve(repoRoot, parsed.data.path);
    const domainRoots = Object.values(DOMAIN_ROOTS).flatMap((roots) =>
      roots.map((rel) => path.resolve(repoRoot, rel))
    );

    if (!isPathWithinRoots(fullPath, domainRoots)) {
      throw new Error("Requested path is outside allowed domain roots.");
    }

    const contents = await fs.readFile(fullPath, "utf8");

    return {
      content: [
        {
          type: "text",
          text: contents
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

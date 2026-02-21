# whitelabel-mcp

Single MCP server with domain namespaces for:
- ui
- functions
- tenants
- admin
- superadmin
- api

## Setup

From this folder:

```
npm install
```

## Run (stdio)

```
npm run dev
```

## Tools

- list_domain_roots: returns repo-relative roots for a domain
- read_domain_file: reads a file inside allowed domain roots

## Resources

- domain://ui
- domain://functions
- domain://tenants
- domain://admin
- domain://superadmin
- domain://api

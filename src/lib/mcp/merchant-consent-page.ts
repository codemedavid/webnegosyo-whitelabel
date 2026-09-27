function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

/** A script-free approval form, matching the existing superadmin consent flow. */
export function merchantConsentHtml(input: {
  clientName: string
  redirectUri: string
  action: string
  token: string
  offlineAccess: boolean
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize SmartMenu connection</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0a0a0a;color:#fafafa;display:grid;min-height:100vh;place-items:center}main{width:min(420px,calc(100% - 64px));padding:28px;border:1px solid #333;border-radius:16px;background:#171717}h1{font-size:24px;overflow-wrap:anywhere}p,dt{color:#b5b5b5}dd{margin:8px 0 0;overflow-wrap:anywhere}dl{padding:16px;background:#0a0a0a;border-radius:8px}form{display:flex;gap:12px;margin-top:24px}button{flex:1;padding:12px;border:1px solid #555;border-radius:8px;font:inherit;cursor:pointer;background:transparent;color:inherit}button[value=approve]{background:white;color:black}</style></head>
<body><main><p>SmartMenu MCP</p><h1>Authorize ${escapeHtml(input.clientName)}</h1>
<p>This client will be able to read and manage your store through SmartMenu tools. Only approve a client you trust.</p>
${input.offlineAccess ? '<p>Access can continue while you are signed out until the connection is revoked.</p>' : ''}
<dl><dt>Returns to</dt><dd>${escapeHtml(input.redirectUri)}</dd></dl>
<form action="${escapeHtml(input.action)}" method="post">
<input type="hidden" name="consent_token" value="${escapeHtml(input.token)}">
<button name="decision" value="deny">Deny</button><button name="decision" value="approve">Approve</button>
</form></main></body></html>`
}

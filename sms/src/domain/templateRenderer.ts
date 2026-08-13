const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export class TemplateVariableError extends Error {
  readonly missingVariables: string[];

  constructor(missingVariables: string[]) {
    super(`Missing template variables: ${missingVariables.join(', ')}`);
    this.name = 'TemplateVariableError';
    this.missingVariables = missingVariables;
  }
}

export function renderTemplate(body: string, variables: Readonly<Record<string, string>>): string {
  const missingVariables: string[] = [];

  const rendered = body.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    if (variables[name] === undefined) {
      missingVariables.push(name);
      return '';
    }

    return variables[name];
  });

  if (missingVariables.length > 0) {
    throw new TemplateVariableError(missingVariables);
  }

  return rendered;
}

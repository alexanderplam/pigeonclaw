import { getValueAtPath } from './fingerprint.js';

type TemplateContext = {
  event: Record<string, unknown>;
  incident: {
    id: string;
    fingerprint: string;
    duplicateCount: number;
  };
  project: {
    id: string;
    name: string;
    repoPath: string;
    rules: string[];
  };
};

const placeholderExpression = /\{\{\s*([a-zA-Z0-9_.[\]-]+)\s*\}\}/g;

export function renderPromptTemplate(template: string, context: TemplateContext): string {
  return template.replace(placeholderExpression, (_, token: string) => {
    const [root, ...rest] = token.split('.');
    const path = rest.join('.');

    switch (root) {
      case 'event':
        return stringifyPromptValue(path ? getValueAtPath(context.event, path) : context.event);
      case 'incident':
        return stringifyPromptValue(
          path
            ? getValueAtPath(context.incident as Record<string, unknown>, path)
            : context.incident,
        );
      case 'project':
        return stringifyPromptValue(
          path ? getValueAtPath(context.project as Record<string, unknown>, path) : context.project,
        );
      default:
        return '';
    }
  });
}

export function buildCodexPrompt(input: {
  basePrompt: string;
  eventPromptTemplate: string;
  event: Record<string, unknown>;
  incidentId: string;
  fingerprint: string;
  duplicateCount: number;
  projectId: string;
  projectName: string;
  repoPath: string;
  rules: string[];
}): string {
  const renderedEventPrompt = renderPromptTemplate(input.eventPromptTemplate, {
    event: input.event,
    incident: {
      id: input.incidentId,
      fingerprint: input.fingerprint,
      duplicateCount: input.duplicateCount,
    },
    project: {
      id: input.projectId,
      name: input.projectName,
      repoPath: input.repoPath,
      rules: input.rules,
    },
  });

  const ruleBlock =
    input.rules.length > 0
      ? `Project rules:\n${input.rules.map((rule) => `- ${rule}`).join('\n')}\n\n`
      : '';

  return `${input.basePrompt.trim()}\n\n${ruleBlock}${renderedEventPrompt.trim()}\n`;
}

function stringifyPromptValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

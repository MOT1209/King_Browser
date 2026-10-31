/**
 * Runtime check of a call's arguments against the tool's declared input schema.
 *
 * Decisions made here:
 *   - only what the registry's schemas use is checked: `required`, the JSON type
 *     of each declared property, and `enum`; nothing else is interpreted;
 *   - undeclared properties are allowed. Existing clients send extras, and the
 *     handlers ignore them; rejecting would break them for no safety gain;
 *   - null counts as absent for optional properties (some clients send null);
 *   - the result is a list of problems, never a throw, so the caller decides how
 *     to report them. Approval and permission checks happen elsewhere and are
 *     not affected: this only rejects malformed calls earlier and uniformly.
 *
 * Dependency-free.
 */

export interface ToolSchema {
  type?: string;
  properties?: Record<string, { type?: string | string[]; enum?: unknown[] }>;
  required?: string[];
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    default: return true;
  }
}

export function validateToolArguments(schema: ToolSchema | undefined, args: unknown): string[] {
  if (!schema) return [];
  const input = args === undefined || args === null ? {} : args;
  if (typeof input !== 'object' || Array.isArray(input)) return ['Arguments must be an object.'];
  const record = input as Record<string, unknown>;
  const problems: string[] = [];
  for (const name of schema.required ?? []) {
    const v = Object.prototype.hasOwnProperty.call(record, name) ? record[name] : undefined;
    if (v === undefined || v === null) problems.push(`Missing required argument "${name}".`);
  }
  for (const [name, spec] of Object.entries(schema.properties ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(record, name)) continue;
    const v = record[name];
    if (v === undefined || v === null) continue;
    const types = Array.isArray(spec.type) ? spec.type : spec.type ? [spec.type] : [];
    if (types.length > 0 && !types.some(t => matchesType(v, t))) problems.push(`Argument "${name}" must be of type ${types.join(' or ')}.`);
    else if (Array.isArray(spec.enum) && !spec.enum.includes(v)) problems.push(`Argument "${name}" must be one of: ${spec.enum.map(String).join(', ')}.`);
  }
  return problems;
}

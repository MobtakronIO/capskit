import type { CapsuleManifest, CapsuleCapManifest } from '@mobtakronio/capskit';

// ── Schema-to-TypeScript conversion ──────────────────────────────────────

function jsonSchemaToTs(schema: Record<string, unknown>, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (!schema || typeof schema !== 'object') {
    return 'unknown';
  }

  const s = schema as Record<string, unknown>;

  if (s.type) {
    return schemaTypeToTs(s.type as string, s, indent);
  }

  // If it has properties, treat as object schema
  if (s.properties) {
    return objectSchemaToTs(s, indent);
  }

  // If it has items, treat as array schema
  if (s.items) {
    return `Array<${jsonSchemaToTs(s.items as Record<string, unknown>, indent)}>`;
  }

  // If it has oneOf / anyOf
  if (s.oneOf && Array.isArray(s.oneOf)) {
    return (s.oneOf as Record<string, unknown>[])
      .map((sub) => jsonSchemaToTs(sub, indent))
      .join(' | ');
  }

  if (s.anyOf && Array.isArray(s.anyOf)) {
    return (s.anyOf as Record<string, unknown>[])
      .map((sub) => jsonSchemaToTs(sub, indent))
      .join(' | ');
  }

  if (s.allOf && Array.isArray(s.allOf)) {
    return (s.allOf as Record<string, unknown>[])
      .map((sub) => jsonSchemaToTs(sub, indent))
      .join(' & ');
  }

  return 'unknown';
}

function schemaTypeToTs(
  type: string,
  schema: Record<string, unknown>,
  indent: number,
): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      if (schema.items) {
        return `Array<${jsonSchemaToTs(schema.items as Record<string, unknown>, indent)}>`;
      }
      return 'unknown[]';
    case 'object':
      if (schema.properties) {
        return objectSchemaToTs(schema, indent);
      }
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

function objectSchemaToTs(schema: Record<string, unknown>, indent: number): string {
  const pad = '  '.repeat(indent);
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema.required as string[]) ?? [];

  if (!props) {
    return 'Record<string, unknown>';
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    const isRequired = required.includes(key);
    const tsType = jsonSchemaToTs(value, indent + 1);
    const suffix = isRequired ? '' : '?';
    const desc = (value.description as string | undefined);
    if (desc) {
      lines.push(`${pad}  /** ${desc} */`);
    }
    lines.push(`${pad}  ${key}${suffix}: ${tsType};`);
  }

  return `{\n${lines.join('\n')}\n${pad}}`;
}

// ── Code generation ──────────────────────────────────────────────────────

interface GenerateOptions {
  manifest: CapsuleManifest[];
}

export function generateTypes({ manifest }: GenerateOptions): string {
  const lines: string[] = [
    '// ──────────────────────────────────────────────────────────────',
    '// Auto-generated CapsKit types — do not edit manually',
    `// Generated at: ${new Date().toISOString()}`,
    '// ──────────────────────────────────────────────────────────────',
    '',
  ];

  // 1. Input/Output types per cap
  const typeLines: string[] = [];
  const capInterfaces: string[] = [];
  const callSignatures: string[] = [];
  const useSignatures: string[] = [];
  const eventTypes: string[] = [];

  for (const capsule of manifest) {
    const capsuleName = pascalCase(capsule.name);

    // Capsule interface
    const capMethods: string[] = [];
    for (const cap of capsule.caps) {
      const capName = cap.name;
      const inputType = cap.inputSchema
        ? jsonSchemaToTs(cap.inputSchema)
        : 'unknown';
      const outputType = cap.outputSchema
        ? jsonSchemaToTs(cap.outputSchema)
        : 'unknown';

      capMethods.push(`  ${capName}(input: ${inputType}): Promise<${outputType}>;`);

      // call() overload
      callSignatures.push(
        `  call(action: '${capsule.name}.${capName}', input: ${inputType}): Promise<${outputType}>;`,
      );
    }

    capInterfaces.push(
      `export interface ${capsuleName}Capsule {\n${capMethods.join('\n')}\n}`,
    );

    // use() overload
    useSignatures.push(
      `  use(name: '${capsule.name}'): ${capsuleName}Capsule;`,
    );

    // Event types
    const allEvents = new Set<string>();
    for (const cap of capsule.caps) {
      if (cap.events?.publishes) {
        for (const evt of cap.events.publishes) {
          allEvents.add(evt);
        }
      }
    }
    if (capsule.events?.publishes) {
      for (const evt of capsule.events.publishes) {
        allEvents.add(evt);
      }
    }

    if (allEvents.size > 0) {
      const eventUnion = [...allEvents].map((e) => `'${e}'`).join(' | ');
      eventTypes.push(
        `export type ${capsuleName}Events = ${eventUnion};`,
      );
    }
  }

  // Assemble output
  if (typeLines.length > 0) {
    lines.push('// ── Input/Output Types ──', '', ...typeLines, '');
  }

  lines.push('// ── Capsule Interfaces ──', '');
  lines.push(...capInterfaces);
  lines.push('');

  lines.push('// ── Event Types ──', '');
  if (eventTypes.length > 0) {
    lines.push(...eventTypes);
  } else {
    lines.push('// No event types found');
  }
  lines.push('');

  lines.push('// ── Call Overloads ──', '');
  lines.push('export interface CapsKitCallOverloads {');
  lines.push(...callSignatures);
  lines.push('}');
  lines.push('');

  lines.push('// ── Use Overloads ──', '');
  lines.push('export interface CapsKitUseOverloads {');
  lines.push(...useSignatures);
  lines.push('}');
  lines.push('');

  lines.push('// ── Combined Client Type ──', '');
  lines.push(
    'export type TypedCapsKitClient = CapsKitCallOverloads & CapsKitUseOverloads;',
  );
  lines.push('');

  return lines.join('\n');
}

function pascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

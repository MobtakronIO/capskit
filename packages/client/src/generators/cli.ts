#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { generateTypes } from './types-generator';

interface Args {
  url: string;
  output: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--url' || arg === '-u') {
      args.url = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      args.output = argv[++i];
    }
  }

  return args as Args;
}

function printHelp(): void {
  console.log(`
Usage: capskit generate [options]

Generate TypeScript types from a running CapsKit server.

Options:
  --url, -u <url>       Base URL of the CapsKit server (required)
  --output, -o <path>   Output file path for generated types (required)
  --help, -h            Show this help message

Examples:
  npx capskit generate --url http://localhost:3000 --output ./src/generated/capskit.ts
  capskit generate -u https://api.example.com -o ./types/capskit.d.ts
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.url) {
    console.error('Error: --url is required');
    printHelp();
    process.exit(1);
  }

  if (!args.output) {
    console.error('Error: --output is required');
    printHelp();
    process.exit(1);
  }

  const baseUrl = args.url.replace(/\/+$/, '');
  const describeUrl = `${baseUrl}/api/capskit/describe`;

  console.log(`Fetching manifest from ${describeUrl}...`);

  let manifest;
  try {
    const response = await fetch(describeUrl);
    if (!response.ok) {
      console.error(
        `Failed to fetch manifest: HTTP ${response.status} ${response.statusText}`,
      );
      process.exit(1);
    }
    manifest = await response.json();
  } catch (err) {
    console.error(`Failed to fetch manifest: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const capsules = manifest?.result?.capsules ?? manifest?.capsules ?? manifest ?? [];
  console.log(`Found ${capsules.length} capsule(s)`);

  const generated = generateTypes({ manifest: capsules });

  const outputPath = resolve(args.output);
  const outputDir = dirname(outputPath);

  if (!existsSync(outputDir)) {
    console.log(`Creating directory: ${outputDir}`);
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(outputPath, generated, 'utf-8');
  console.log(`Types written to ${outputPath}`);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

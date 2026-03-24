# CapsKit Monorepo

The universal capability kernel - a framework-agnostic runtime for pure business logic.

## Project Structure

- `packages/capskit` - Core kernel and system capsules
- `packages/capskit-http-elysia` - Elysia HTTP transport adapter
- `packages/capskit-websocket-elysia` - Elysia WebSocket transport adapter

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build all packages:
   ```bash
   npm run build
   ```

3. Run tests:
   ```bash
   npm run test
   ```

## Development

The project uses a monorepo structure with npm workspaces.

### Managing Packages

To add a new dependency to a specific package:
```bash
npm install <package> -w @mobtakronio/capskit
```

To run a script in a specific package:
```bash
npm run <script> -w @mobtakronio/capskit
```

## Documentation

See `packages/capskit/README.md` for core details or visit the `docs/` folder.

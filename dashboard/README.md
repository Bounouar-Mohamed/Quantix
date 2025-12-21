# Quantix Dashboard

Dashboard minimaliste pour monitorer le service IA Quantix.

## Installation

```bash
cd dashboard
bun install
```

## Développement

```bash
bun dev
```

Le dashboard sera accessible sur http://localhost:3102

## Configuration

| Variable | Défaut | Description |
|----------|--------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3101/api/v1` | URL de l'API Quantix |

## Build

```bash
bun run build
bun start
```


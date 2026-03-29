# npm Publish Readiness

This project is configured for npm packaging, with:
- `main` entry (`aspectscript.js`)
- `types` entry (`index.d.ts`)
- `bin` command (`aspectscript`)

Current state:
- `package.json` is publish-ready (`"private": false`).

## Checklist

1. Set package metadata

```json
{
  "name": "@pleger/esa-js",
  "version": "0.2.0",
  "description": "ESA-JS and AspectScript runtime and tooling",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/pleger/ESA.git"
  }
}
```

2. Dry run package contents

```bash
npm pack --dry-run
```

3. Verify commands

```bash
npm test
npm run test:conformance
npx aspectscript --help
```

4. Publish

```bash
npm publish --access public
```

## Optional hardening

- Add `"files"` in `package.json` to control published artifacts explicitly.
- Add CI workflow for `npm test` + `npm run test:conformance` before release.

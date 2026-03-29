# npm Publish Readiness

This project is configured for npm packaging, with:
- `main` entry (`aspectscript.js`)
- `types` entry (`index.d.ts`)
- `bin` commands (`aspectscript`, `esa`)

Current state:
- `package.json` is publish-ready (`"private": false`).
- Package name is scoped: `@pleger/esa-js`.

## Checklist

1. Set package metadata

```json
{
  "name": "@pleger/esa-js",
  "version": "0.2.1",
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

5. Verify published page

```bash
npm view @pleger/esa-js version
open https://www.npmjs.com/package/@pleger/esa-js
```

## Optional hardening

- Add `"files"` in `package.json` to control published artifacts explicitly.
- Add CI workflow for `npm test` + `npm run test:conformance` before release.

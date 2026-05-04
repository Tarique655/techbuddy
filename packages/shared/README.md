# @techbuddy/shared

Shared types, design tokens, and (eventually) Zod validation schemas used by every app in the monorepo.

Imported as:

```ts
import { IssueSummary, fontSize, color } from "@techbuddy/shared";
```

After scaffolding the apps, link this package by adding `"@techbuddy/shared": "workspace:*"` to each app's `package.json` dependencies and running `pnpm install` from the root.

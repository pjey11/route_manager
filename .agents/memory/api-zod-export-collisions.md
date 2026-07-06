---
name: api-zod barrel export collisions
description: Why lib/api-zod/src/index.ts cannot do a blind `export *` from both generated/api and generated/types, and how to add new OpenAPI schemas safely.
---

`lib/api-zod/src/index.ts` re-exports from two Orval-generated modules:
- `./generated/api` — zod schema consts (e.g. `LoginBody`, `UpdateTemplateBody`) used at runtime via `.safeParse()`.
- `./generated/types` — plain TS interfaces/types with the same names for some inline request/response bodies defined in `openapi.yaml`.

When an OpenAPI operation's request/response body is defined inline (not as a `$ref` to a named schema), Orval generates both a zod const and a same-named TS interface, and `export *` from both files causes TS2308 "ambiguous export" errors.

**Why:** This collision is pre-existing and independent of any single new endpoint — it affects every inline body/response name in the spec, not just new ones you add.

**How to apply:** Don't do `export * from "./generated/types"`. Instead export only the non-colliding type names explicitly via `export type { ... } from "./generated/types"`. The zod const already provides an equivalent inferred type for any excluded name (use `z.infer<typeof X>` at the call site if a type is needed). When adding a new inline schema to `openapi.yaml`, after running codegen, diff the exported names of `generated/api.ts` and `generated/types/index.ts` for new collisions before assuming `export *` still works.

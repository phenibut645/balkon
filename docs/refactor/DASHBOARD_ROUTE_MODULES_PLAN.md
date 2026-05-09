# Dashboard Route Modules Plan

This document records the route-module direction for the growing Balkon dashboard API.

It is a planning and refactor guide, not an implementation patch by itself.

Read together with:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/ECONOMY_MUTATION_INVENTORY.md`

## 1. Problem

`src/api/routes/dashboardRoutes.ts` is a legacy broad route file.

It already registers some extracted route modules, but it still contains many direct route handlers, shared parsing helpers, response mapping helpers, and mixed domain flows.

As the API grows, adding special endpoints directly to `dashboardRoutes.ts` will make the file harder to review, test, and safely refactor.

This is especially risky for endpoints involving:

- economy;
- inventory;
- market;
- bot shop;
- OBS/shop actions;
- admin item management;
- guild dashboards;
- notifications;
- profile/current-user state;
- security/admin permissions.

## 2. Accepted Direction

`dashboardRoutes.ts` should gradually become a composition layer.

Target shape:

```text
registerDashboardRoutes(app)
  -> registerProfileRoutes(app)
  -> registerEconomyRoutes(app)
  -> registerGuildDashboardRoutes(app)
  -> registerJobRoutes(app)
  -> registerMarketRoutes(app)
  -> registerInventoryRoutes(app)
  -> registerCraftExecutionRoutes(app)
  -> registerObsShopRoutes(app)
  -> registerAdminItemRoutes(app)
  -> registerAdminObsRoutes(app)
  -> registerNotificationRoutes(app)
  -> registerStreamerStudioRoutes(app)
  -> registerAdminStreamerRoutes(app)
  -> registerStreamerApplicationRoutes(app)
```

This target does not require one file per single endpoint.

Correct rule:

```text
coherent route group / feature endpoint cluster -> one route module
```

Rejected default:

```text
one random endpoint -> one random file
```

Exception:

A single endpoint may get its own route module when it is complex, security-sensitive, likely to grow, or already forms a distinct feature boundary.

## 3. Route Module Rules

### New endpoints

New non-trivial dashboard endpoints should not be added directly to `dashboardRoutes.ts`.

Rules:

- if the endpoint belongs to an existing route module, add it there;
- if the endpoint starts a new coherent feature group, create `registerXRoutes(app)`;
- if the endpoint is a one-off but likely to grow or is security-sensitive, create a small module anyway;
- if the endpoint is tiny and temporary, it may stay only with a follow-up note and owner.

### Existing endpoints

Existing endpoints should be extracted by medium safe route-group slices.

Do not extract random single endpoints unless they are already isolated or high-value.

Each extraction must preserve:

- path;
- HTTP method;
- preHandler/auth requirements;
- request validation behavior;
- response shape;
- error codes/messages;
- service calls;
- side effects.

### Shared helpers

Do not blindly move every helper into a global `routeUtils.ts`.

Helper rules:

- if a helper is used only by one route module, keep it local to that module;
- if a helper is used by two or more route modules and is generic, move it to a named shared dashboard route helper file;
- if a helper encodes domain behavior, move it to the domain service/use-case instead of a shared helper;
- avoid catch-all `utils` files.

Potential shared file names, only when justified:

```text
src/api/routes/dashboard/shared/parse.ts
src/api/routes/dashboard/shared/responses.ts
src/api/routes/dashboard/shared/validation.ts
```

Do not create these before actual duplication requires them.

## 4. Candidate Route Groups

Potential future modules:

| Module | Scope | Notes |
| --- | --- | --- |
| `economyRoutes.ts` | `/economy/me`, economy dashboard reads, non-admin economy endpoints | Keep admin adjustment separate if admin concerns grow. |
| `adminEconomyRoutes.ts` | `/admin/economy/*` | Security-sensitive; must keep `requireBotAdmin`/`requireBotContributor` behavior exact. |
| `guildDashboardRoutes.ts` | `/guilds/me`, `/guilds/:guildId/overview`, future guild dashboards | Must preserve selected-guild semantics. |
| `obsShopRoutes.ts` | `/shop/obs/*` user-facing OBS shop endpoints | High-risk because purchase flows include money and external side effects. |
| `adminObsRoutes.ts` | `/admin/obs/*` diagnostics/actions | Security-sensitive; separate from user-facing OBS shop. |
| `adminItemRoutes.ts` | `/admin/items`, item rarity/type search/edit routes | Item catalog/admin surface; should align with future item platform design. |
| `botShopRoutes.ts` | `/botshop/*` user-facing bot shop routes | Do not mix with market purchase internals without inventory. |
| `craftRoutes.ts` | `/craft/recipes` and read-only craft metadata | Execution already has `craftExecutionRoutes.ts`; keep read and execution split if useful. |
| `notificationAdminRoutes.ts` | `/admin/notifications/*` | Broadcast/security-sensitive. |

These names are recommendations, not mandatory final names.

## 5. Required Inventory Before Broad Extraction

Before broad dashboard route extraction, create or refresh a route inventory.

Suggested file:

```text
docs/refactor/DASHBOARD_ROUTES_INVENTORY.md
```

Required columns:

- path;
- method;
- current file/line range;
- preHandler/auth requirements;
- service dependencies;
- request validation helpers used;
- response shape;
- error codes/messages;
- side effects;
- target route module;
- extraction risk;
- candidate grouping.

No runtime code changes in the inventory task.

## 6. Safe Extraction Slice Shape

A safe dashboard route extraction should usually change only:

- `src/api/routes/dashboardRoutes.ts`;
- one new or existing `src/api/routes/dashboard/<module>Routes.ts` file;
- optionally a focused doc update.

It should not simultaneously change:

- service logic;
- database SQL;
- schema/migrations;
- frontend API contracts;
- auth middleware;
- unrelated route groups;
- response shapes.

Good slice example:

```text
Extract user-facing OBS shop routes from dashboardRoutes.ts into dashboard/obsShopRoutes.ts, preserving behavior exactly.
```

Bad slice example:

```text
Refactor dashboardRoutes.ts, fix OBS purchases, clean ItemService, and improve responses.
```

That is not a slice. That is a circus knife act.

## 7. Validation Requirements

For every route extraction runtime PR:

- run `npm run build`;
- show `git diff` for changed files;
- grep/search old and new paths;
- confirm old paths still register under the same `/api` dashboard prefix;
- list unchanged response shapes;
- list unchanged auth/preHandler requirements;
- list unchanged service calls;
- verify no conflict markers in docs.

Suggested searches:

```text
registerDashboardRoutes
registerXRoutes
app.get(
app.post(
app.patch(
app.delete(
requireAuth
requireBotAdmin
requireBotContributor
<<<<<<<
=======
>>>>>>>
```

## 8. Rejection Criteria

Reject route extraction patches that:

- change endpoint paths;
- change HTTP methods;
- weaken auth/preHandler requirements;
- change response shape without explicit approval;
- move business logic into routes;
- add SQL to routes;
- combine route extraction with service/database refactor;
- create broad catch-all route helper files;
- delete helpers that are still used;
- remove imports based on guesswork;
- leave conflict markers in docs or code.

## 9. Recommended Next Task

Recommended next task:

```text
Strong Tommy read-only DASHBOARD_ROUTES_INVENTORY.md
```

The inventory should identify which route group is the best next medium extraction after the current economy cleanup.

Likely candidates:

1. `economyRoutes.ts` / `adminEconomyRoutes.ts` if small and isolated;
2. `adminItemRoutes.ts` because item platform work is coming;
3. `obsShopRoutes.ts` only after careful inventory due money/side-effect risk;
4. `guildDashboardRoutes.ts` if its endpoints are isolated.

Do not start extraction before inventory unless the touched route group is already proven small and isolated.

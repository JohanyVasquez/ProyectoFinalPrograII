This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

ParkEasy = Expo + TypeScript + Supabase (PostgreSQL, Auth, RLS), built by a
5-person team. Each person owns a module; see "File ownership" below before
editing anything outside `src/app/`.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

Verified for this project (SDK 57): `Stack.Protected` accepts `guard` but
**not** `redirectTo` (SDK 58+). Also verified: routes live in `src/app/`,
entry point is `expo-router/entry`, `@/*` → `./src/*`.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npm install                  # npm is the package manager here (package-lock.json)
npx expo install <package>   # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start               # start the dev server
npx expo start -c            # restart with cleared cache — REQUIRED after editing .env
npx expo lint                # lint
npm run typecheck            # tsc --noEmit
npm test                     # tests; runs typecheck first via pretest
npx expo-doctor              # diagnose dependency and config issues
npx expo install --fix       # fix incompatible package versions
```

Run `npm run lint && npm run typecheck && npm test` before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Never hardcode a path string. Use `ROUTES` from `src/constants/routes.ts` so a typo becomes a compile error.
- Docs: https://docs.expo.dev/router/introduction.md

### Auth protection

`Stack.Protected` lives **only** in `src/app/_layout.tsx`. It guards the `(app)`
group with `isAuthenticated` and the `(auth)` group with its inverse. Do **not**
re-declare a screen in both groups — Expo Router allows a screen in only one
active group.

Screens inside `(app)/` are already protected. Adding a route there requires no
extra work. To add a header, you must still register it in
`src/app/(app)/_layout.tsx`; otherwise it renders bare (harmless but ugly).

## Non-negotiable rules

These are the mistakes that are easy to make and hard to notice:

1. **Never create a second Supabase client.** Always `import { supabase } from '@/lib/supabase'`. Two instances duplicate session state and behave inconsistently per screen.
2. **RLS is the authorization boundary, not the frontend.** Hiding a button is a courtesy. If an operation that should fail succeeds, that is an RLS bug — fix the SQL, never patch it in the client.
3. **Never put `service_role` or a `secret` in the app.** `EXPO_PUBLIC_*` values are bundled in plaintext and are *not* secrets — that is by design. RLS protects the data.
4. **`user_id` always comes from the verified session**, never from a UI parameter. See `getVerifiedUserId()` in `src/services/auth.service.ts`.
5. **Never edit `supabase/migrations/001_initial_schema.sql`.** Once applied anywhere, it is frozen. New changes go in `002_*.sql`, etc. It is deliberately not idempotent so a double-apply fails loudly.
6. **Enum names come from Postgres, not intuition:** `public.app_role` (not `user_role`) and `public.parking_session_status` (not `session_status`). Mismatching them silently breaks type inference.
7. **Never show a raw Supabase/Postgres error to the user.** Use `translateError()` from `src/lib/errors.ts`; technical detail belongs in `technicalMessage` (logged in dev only).
8. **Never mock Supabase in app code.** A simulated client gives false confidence: it tests your mock, not the integration.

## Things that will bite you

- **`onAuthStateChange` callbacks must not `await`.** The SDK can deadlock. React to auth changes outside the callback. (supabase-js ≥2.74 also emits a deprecation notice for async callbacks.)
- **`getSession()` is local-only** (reads AsyncStorage); `getClaims()` validates the JWT against the server. `src/contexts/AuthContext.tsx` uses both, in that order, on startup.
- **`isLoading` starts as `supabase !== null`, not `true`.** Setting it inside the effect trips `react-hooks/set-state-in-effect` and causes a cascading render.
- **AsyncStorage is mandatory.** Without `storage: AsyncStorage`, `persistSession` cannot work on native and the session dies on every restart.
- **RLS policies are row-level, not column-level.** The `GRANT update` on `parking_spaces` is table-wide; the trigger `private.guard_space_update` is the *only* thing stopping an `operator` from renaming spaces. Do not weaken it.
- **A parking session is not a reservation.** Saving one never changes `parking_spaces.status`.
- **`markReminderAsSent()` writes a DB row. It sends nothing.** Notifications are Person 5's job.
- **Prefer `deactivateSpace`/`deactivateLocation` over delete.** The composite FK `session_space_fk` is `on delete no action`, so deleting a space with sessions fails with 23503 — on purpose.

## Testing

Tests use Node's built-in runner via `tsx`, not Jest. Only pure logic is
covered (`src/lib/*.test.ts`); there is no component renderer in this project.

`tsconfig.json` excludes `*.test.ts` (needs DOM vs. Node types). Tests are
typechecked separately via `tsconfig.test.json`, which `pretest` runs.

**Never write `PASS` for a test you did not run.** `docs/TEST_PLAN.md` separates
automated results (block A) from manual ones requiring real credentials (block
B). Block B is `NOT RUN` until someone executes it with a real Supabase project
— do not claim the integration works before then.

## File ownership

Before editing outside `src/app/`, check `docs/INTEGRATION_GUIDE.md` §7.

| Path | Owner |
| --- | --- |
| `src/lib/`, `src/contexts/`, `src/hooks/`, `src/services/`, `src/types/`, `src/constants/` | Persona 1 |
| `supabase/migrations/` | Persona 1 |
| `src/app/(auth)/`, `src/app/(app)/profile/`, `src/components/common/` | Persona 2 |
| `src/app/(app)/parking/` | Persona 3 |
| `src/app/(app)/vehicle/` | Persona 4 |
| `src/app/(app)/history/` | Persona 5 |
| `src/app/_layout.tsx` | Persona 1 |

Practical rule: you may add files under your own route folder and edit your own
screens. To touch someone else's file, open a PR and say so.

## Docs to read before your first task

- `docs/INTEGRATION_GUIDE.md` — copy-pasteable examples for each module owner
- `docs/DATABASE.md` — tables, RLS matrices, constraints
- `docs/ARCHITECTURE.md` — how it is wired and why
- `supabase/README.md` — Supabase project setup, role promotion via SQL Editor

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code (`expo-location`, `react-native-maps`, `expo-notifications`), the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
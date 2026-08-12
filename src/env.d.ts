/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type PortalUser = Awaited<ReturnType<typeof import('./lib/auth/session').getSessionUser>> extends infer T
  ? T extends { user: infer U }
    ? U
    : never
  : never;

declare namespace App {
  interface Locals {
    user: PortalUser | null;
    session: { id: string; csrfToken: string } | null;
  }
}

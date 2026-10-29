export interface BuildIdentity { commit: string | null; dirty: boolean }
declare const __DUKE_BUILD_IDENTITY__: BuildIdentity;

/** Injected into both Worker and client bundles by Vite; never derived from a
 * request header, a source-data date, or the runtime clock. */
export const buildIdentity: BuildIdentity = typeof __DUKE_BUILD_IDENTITY__ === "undefined"
  ? { commit: null, dirty: true }
  : __DUKE_BUILD_IDENTITY__;

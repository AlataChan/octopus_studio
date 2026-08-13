import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve("src/App.jsx"), "utf8");
const routeSkeletonSource = readFileSync(
  resolve("src/components/RouteSkeleton/index.jsx"),
  "utf8"
);
const preloaderSource = readFileSync(
  resolve("src/components/Preloader.jsx"),
  "utf8"
);

describe("route suspense fallback", () => {
  it("uses the route skeleton instead of the full-screen preloader", () => {
    expect(appSource).toContain("fallback={<RouteSkeleton />}");
    expect(appSource).not.toContain("fallback={<FullScreenLoader />}");
    expect(appSource).not.toContain("components/Preloader");
  });

  it("keeps the fallback as a content skeleton, not a fixed full-screen overlay", () => {
    expect(routeSkeletonSource).toContain('data-testid="route-skeleton"');
    expect(routeSkeletonSource).toContain("animate-pulse");
    expect(routeSkeletonSource).not.toContain('id="preloader"');
    expect(routeSkeletonSource).not.toContain("fixed");
    expect(routeSkeletonSource).not.toContain("z-999999");
    expect(routeSkeletonSource).not.toContain("w-screen");
  });

  it("does not remove component-level full-screen loading states", () => {
    expect(preloaderSource).toContain("function FullScreenLoader");
    expect(preloaderSource).toContain('id="preloader"');
  });
});

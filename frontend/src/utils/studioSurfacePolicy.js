export function isFocusedStudioSurface(value) {
  return (
    String(value ?? "true")
      .trim()
      .toLowerCase() !== "false"
  );
}

export function navigationVisibility(value) {
  return {
    sellableLoop: true,
    compatibility: !isFocusedStudioSurface(value),
  };
}

export const SHOW_COMPATIBILITY_NAVIGATION = navigationVisibility(
  import.meta.env.VITE_STUDIO_FOCUSED_SURFACE
).compatibility;

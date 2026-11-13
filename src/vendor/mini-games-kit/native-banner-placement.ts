/** All rects use x/y at their outer border, without scroll or parent-padding adjustment. */
export interface BannerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface BannerInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface NativeBannerPlacementInput {
  slot: BannerRect; // CSS viewport coordinates, e.g. getBoundingClientRect()
  viewport: { width: number; height: number }; // same CSS coordinate space as slot
  webView: BannerRect; // native physical pixels relative to root border
  root: { width: number; height: number }; // native physical pixels
  safeInsets?: BannerInsets; // root exclusions, native pixels
  parentPadding?: { left: number; top: number }; // FrameLayout padding, native pixels
  adHeight: number; // actual SDK height at the mapped slot width, native pixels
  minWidth?: number; // optional SDK minimum, native pixels (not CSS px or dp)
}
export type NativeBannerPlacement =
  | {
      kind: "hidden";
      reason:
        | "invalid-geometry"
        | "outside-viewport"
        | "outside-root"
        | "too-narrow";
    }
  | { kind: "reserve"; heightCss: number; widthNative: number }
  | { kind: "place"; rect: BannerRect; marginLeft: number; marginTop: number };

const finite = (n: number) => Number.isFinite(n);
const positive = (n: number) => finite(n) && n > 0;
const validRect = (r: BannerRect) =>
  finite(r.x) && finite(r.y) && positive(r.width) && positive(r.height);
const contains = (outer: BannerRect, inner: BannerRect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Pure geometry only: caller owns SDK measurement, lifecycle, orientation epochs and visibility. */
export function resolveNativeBannerPlacement(
  input: NativeBannerPlacementInput,
): NativeBannerPlacement {
  const { slot, viewport, webView, root, adHeight } = input;
  const insets = input.safeInsets ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const padding = input.parentPadding ?? { left: 0, top: 0 };
  const minWidth = input.minWidth ?? 0;
  if (
    !validRect(slot) ||
    !validRect(webView) ||
    !positive(viewport.width) ||
    !positive(viewport.height) ||
    !positive(root.width) ||
    !positive(root.height) ||
    !positive(adHeight) ||
    ![
      insets.left,
      insets.top,
      insets.right,
      insets.bottom,
      padding.left,
      padding.top,
      minWidth,
    ].every((n) => finite(n) && n >= 0)
  ) {
    return { kind: "hidden", reason: "invalid-geometry" };
  }
  if (!contains({ x: 0, y: 0, ...viewport }, slot))
    return { kind: "hidden", reason: "outside-viewport" };
  const scale = webView.width / viewport.width;
  const x = Math.ceil(webView.x + slot.x * scale);
  const y = Math.ceil(webView.y + slot.y * scale);
  const width = Math.floor(webView.x + (slot.x + slot.width) * scale) - x;
  const height = Math.floor(webView.y + (slot.y + slot.height) * scale) - y;
  const safe = {
    x: insets.left,
    y: insets.top,
    width: root.width - insets.left - insets.right,
    height: root.height - insets.top - insets.bottom,
  };
  const mapped = { x, y, width, height };
  if (!positive(scale) || !validRect(mapped) || !validRect(safe))
    return { kind: "hidden", reason: "invalid-geometry" };
  if (!contains(safe, mapped) || !contains(webView, mapped))
    return { kind: "hidden", reason: "outside-root" };
  if (width < minWidth) return { kind: "hidden", reason: "too-narrow" };
  const sdkHeight = Math.ceil(adHeight);
  if (height < sdkHeight) {
    // Account for inward edge rounding, so remeasurement can actually fit the SDK view.
    const heightCss = Math.ceil((y + sdkHeight - webView.y) / scale - slot.y);
    return { kind: "reserve", heightCss, widthNative: width };
  }
  const rect = {
    x,
    y: y + Math.floor((height - sdkHeight) / 2),
    width,
    height: sdkHeight,
  };
  return {
    kind: "place",
    rect,
    marginLeft: rect.x - padding.left,
    marginTop: rect.y - padding.top,
  };
}

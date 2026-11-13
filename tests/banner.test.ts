import { expect, it } from "vitest";
import {
  resolveNativeBannerPlacement as place,
  type NativeBannerPlacementInput,
} from "../src/vendor/mini-games-kit/native-banner-placement";
const base: NativeBannerPlacementInput = {
  slot: { x: 0, y: 750, width: 390, height: 60 },
  viewport: { width: 390, height: 844 },
  webView: { x: 0, y: 24, width: 780, height: 1688 },
  root: { width: 780, height: 1736 },
  adHeight: 100,
};
it("uses WebView scale and root offset, centers the SDK height, subtracts parent padding", () => {
  const result = place({ ...base, parentPadding: { left: 4, top: 24 } });
  expect(result).toEqual({
    kind: "place",
    rect: { x: 0, y: 1534, width: 780, height: 100 },
    marginLeft: -4,
    marginTop: 1510,
  });
});
it("supports a landscape control-column slot without an orientation cutoff", () => {
  expect(
    place({
      slot: { x: 280, y: 260, width: 280, height: 50 },
      viewport: { width: 568, height: 320 },
      webView: { x: 0, y: 0, width: 1136, height: 640 },
      root: { width: 1136, height: 640 },
      adHeight: 100,
      minWidth: 560,
    }).kind,
  ).toBe("place");
});
it("requests CSS height before placement when SDK height exceeds reservation", () => {
  const input = { ...base, slot: { ...base.slot, height: 30 } };
  const result = place(input);
  expect(result).toEqual({ kind: "reserve", heightCss: 50, widthNative: 780 });
  if (result.kind === "reserve")
    expect(
      place({ ...input, slot: { ...input.slot, height: result.heightCss } })
        .kind,
    ).toBe("place");
});
it("fractional pixel reservation converges after remeasurement", () => {
  const input = {
    ...base,
    slot: { x: 0, y: 100.3, width: 390, height: 10 },
    webView: { x: 0, y: 0, width: 585, height: 1266 },
    root: { width: 585, height: 1266 },
    adHeight: 76,
  };
  const result = place(input);
  expect(result.kind).toBe("reserve");
  if (result.kind === "reserve")
    expect(
      place({ ...input, slot: { ...input.slot, height: result.heightCss } })
        .kind,
    ).toBe("place");
});
it.each([{ x: -1 }, { x: 1 }, { y: -1 }, { y: 820 }])(
  "hides slots outside the CSS viewport: %o",
  (patch) => {
    expect(place({ ...base, slot: { ...base.slot, ...patch } })).toEqual({
      kind: "hidden",
      reason: "outside-viewport",
    });
  },
);
it("rejects root safe area overlap on either axis", () => {
  expect(
    place({ ...base, safeInsets: { left: 1, top: 0, right: 0, bottom: 0 } }),
  ).toEqual({ kind: "hidden", reason: "outside-root" });
  expect(
    place({ ...base, safeInsets: { left: 0, top: 0, right: 0, bottom: 150 } }),
  ).toEqual({ kind: "hidden", reason: "outside-root" });
});
it("rejects a mapped slot outside a shorter native WebView", () => {
  expect(
    place({ ...base, webView: { ...base.webView, height: 1000 } }),
  ).toEqual({ kind: "hidden", reason: "outside-root" });
});
it.each([NaN, Infinity, 0, -1])(
  "rejects invalid viewport width %s",
  (width) => {
    expect(place({ ...base, viewport: { ...base.viewport, width } })).toEqual({
      kind: "hidden",
      reason: "invalid-geometry",
    });
  },
);
it("keeps the configured SDK minimum in native pixels", () => {
  expect(place({ ...base, minWidth: 781 })).toEqual({
    kind: "hidden",
    reason: "too-narrow",
  });
});
it("returns stable identical placement and keeps rounded rect within slot", () => {
  const input = {
    ...base,
    slot: { x: 0.3, y: 200.2, width: 389.1, height: 60.3 },
  };
  const result = place(input);
  expect(result).toEqual(place(input));
  if (result.kind !== "place") throw Error("expected placement");
  expect(result.rect.x).toBeGreaterThanOrEqual(input.slot.x * 2);
  expect(result.rect.x + result.rect.width).toBeLessThanOrEqual(
    (input.slot.x + input.slot.width) * 2,
  );
});

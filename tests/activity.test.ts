import { it, expect } from "vitest";
import { GameplayActivityCoordinator } from "../src/vendor/mini-games-kit/activity";
it("does not resume over a still-open dialog after native resume", () => {
  const events: string[] = [];
  const activity = new GameplayActivityCoordinator(
    () => events.push("start"),
    () => events.push("stop"),
  );
  activity.setGameplayDesired(true);
  activity.setBlocked("dialog", true);
  activity.setBlocked("native", true);
  activity.setBlocked("native", false);
  expect(events).toEqual(["start", "stop"]);
  activity.setBlocked("dialog", false);
  expect(events).toEqual(["start", "stop", "start"]);
});

import { describe, expect, it } from "vitest";

const notificationRoutes = [
  /^\/student\/homework\/[0-9a-f-]+(?:\/photos|\/result)?$/,
  /^\/student\/(?:calendar|notifications|results\/[0-9a-f-]+)$/,
  /^\/teacher\/(?:calendar|notifications|review(?:\/[0-9a-f-]+)?|results\/[0-9a-f-]+|homework\/[0-9a-f-]+\/result)$/,
];
const generatedNotificationLinks = [
  "/student/homework/53000000-0000-0000-0000-000000000001",
  "/student/homework/53000000-0000-0000-0000-000000000001/photos",
  "/student/homework/53000000-0000-0000-0000-000000000001/result",
  "/teacher/homework/53000000-0000-0000-0000-000000000001/result",
  "/teacher/review/56000000-0000-0000-0000-000000000001",
  "/student/calendar",
];

describe("notification route map", () => {
  it("maps every generated link to a registered protected route", () => {
    for (const href of generatedNotificationLinks)
      expect(notificationRoutes.some((route) => route.test(href))).toBe(true);
  });
  it("rejects the removed plural result route", () => {
    expect(
      notificationRoutes.some((route) =>
        route.test(
          "/student/homework/53000000-0000-0000-0000-000000000001/results",
        ),
      ),
    ).toBe(false);
  });
});

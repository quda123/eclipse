import { describe, expect, it } from "vitest";
import {
  assignmentStatus,
  bestAttempt,
  canSubmit,
  effectiveDeadline,
  isAcceptedAnswer,
  manualMaximum,
  movedOccurrence,
  normalizeAnswer,
  notificationKey,
  scoreAttempt,
  validateHomework,
  validateImage,
} from "./homework";

describe("answers", () => {
  it("normalizes permitted differences only", () => {
    expect(normalizeAnswer("  Иван   Иванов ")).toBe("иван иванов");
    expect(isAcceptedAnswer("Москва", ["москва"])).toBe(true);
    expect(isAcceptedAnswer("0,5", ["0.5"])).toBe(false);
  });
});
describe("deadlines and status", () => {
  it("uses an individual extension", () =>
    expect(
      canSubmit(
        "2026-07-15T20:00:00Z",
        "2026-07-16T10:00:00Z",
        "2026-07-17T20:00:00Z",
      ),
    ).toBe(true));
  it("derives overdue on the shared path", () =>
    expect(
      assignmentStatus({
        deadline: "2026-07-15T20:00:00Z",
        now: "2026-07-16T10:00:00Z",
      }),
    ).toBe("Просрочено"));
  it("builds stable notification keys", () =>
    expect(notificationKey("deadline", "abc", "2026-07-15")).toBe(
      "deadline:abc:2026-07-15",
    ));
});
describe("scoring", () => {
  it("combines automatic and manual points", () =>
    expect(
      scoreAttempt({
        automaticCorrect: 3,
        automaticTotal: 4,
        manualPoints: 2,
        manualMaximum: 4,
      }),
    ).toEqual({ score: 5, maximum: 8, percentage: 63 }));
  it("selects the highest result", () =>
    expect(bestAttempt([{ score: 4 }, { score: 7 }, { score: 6 }])).toEqual({
      score: 7,
    }));
  it("keeps the first result when best scores tie", () => {
    const first = { score: 7, id: "first" };
    expect(bestAttempt([first, { score: 7, id: "second" }])).toBe(first);
  });
  it("calculates fixed legacy and variable manual maximums", () => {
    expect(manualMaximum(3)).toBe(6);
    expect(manualMaximum(-1)).toBe(0);
    expect(manualMaximum([2, 3, 4])).toBe(9);
  });
});
describe("workflow helpers", () => {
  it("selects the latest extension", () =>
    expect(effectiveDeadline("2026-07-10", ["2026-07-12", "2026-07-11"])).toBe(
      "2026-07-12",
    ));
  it("validates size, MIME and extension together", () => {
    expect(
      validateImage({
        name: "page.jpeg",
        type: "image/jpeg",
        size: 10,
      } as File),
    ).toBe(true);
    expect(
      validateImage({ name: "page.exe", type: "image/jpeg", size: 10 } as File),
    ).toBe(false);
    expect(
      validateImage({ name: "page.jpg", type: "image/jpeg", size: 0 } as File),
    ).toBe(false);
  });
  it("moves only one recurring occurrence", () =>
    expect(
      movedOccurrence([{ startsAt: "a" }, { startsAt: "b" }], "a", "c"),
    ).toEqual([{ startsAt: "c" }, { startsAt: "b" }]));
  it("rejects incomplete homework for each selected mode", () => {
    const base = {
      title: "Алгебра",
      attempts: 2,
      studentIds: ["student"],
      questions: [{ prompt: "2+2", answers: ["4"] }],
      manualTasks: [{ prompt: "Покажите решение", maxPoints: 3 }],
    };
    expect(validateHomework({ ...base, mode: "combined" })).toEqual([]);
    expect(
      validateHomework({
        ...base,
        mode: "automatic",
        questions: [{ prompt: "2+2", answers: [] }],
      }),
    ).toContain("Заполните вопросы и принимаемые ответы");
    expect(
      validateHomework({ ...base, mode: "manual", manualTasks: [] }),
    ).toContain("Заполните письменные задачи");
  });
});

import { describe, expect, it } from "vitest";
import {
  formatMessageTime,
  getMessageDayKey,
  getMessageDayLabel,
} from "./message-dates";

const now = new Date("2026-08-11T15:00:00-03:00");

describe("inbox message dates", () => {
  it("groups timestamps by the local calendar day", () => {
    expect(
      getMessageDayKey("2026-08-11T09:30:00-03:00", "America/Sao_Paulo"),
    ).toBe("2026-8-11");
    expect(
      getMessageDayKey("2026-08-10T23:59:00-03:00", "America/Sao_Paulo"),
    ).toBe("2026-8-10");
  });

  it("labels today, yesterday and older messages", () => {
    expect(getMessageDayLabel("2026-08-11T09:30:00-03:00", now)).toEqual({
      kind: "today",
    });
    expect(getMessageDayLabel("2026-08-10T09:30:00-03:00", now)).toEqual({
      kind: "yesterday",
    });
    expect(
      getMessageDayLabel("2026-08-09T09:30:00-03:00", now, "pt-BR"),
    ).toEqual({
      kind: "date",
      value: "09/08/2026",
    });
  });

  it("ignores missing or invalid timestamps", () => {
    expect(getMessageDayKey(undefined)).toBeNull();
    expect(getMessageDayLabel("not-a-date", now)).toBeNull();
  });

  it("follows the requested browser locale for date and time order", () => {
    expect(
      getMessageDayLabel(
        "2026-08-09T09:30:00-03:00",
        now,
        "en-US",
        "America/Sao_Paulo",
      ),
    ).toEqual({
      kind: "date",
      value: "08/09/2026",
    });
    expect(
      formatMessageTime(
        "2026-08-11T15:10:00-03:00",
        "fallback",
        "en-US",
        "America/Sao_Paulo",
      ),
    ).toBe("03:10 PM");
  });
});

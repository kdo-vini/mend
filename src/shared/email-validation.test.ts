import { describe, expect, it } from "vitest";
import { isGmailAddress, validateSignupEmail } from "./email-validation";

describe("signup email validation", () => {
  it("accepts a normal email address", () => {
    expect(validateSignupEmail(" founder@company.com ")).toEqual({
      valid: true,
      domain: "company.com",
    });
    expect(validateSignupEmail("founder+trial@company.co.uk")).toEqual({
      valid: true,
      domain: "company.co.uk",
    });
  });

  it("rejects malformed addresses", () => {
    expect(validateSignupEmail("founder@company")).toEqual({
      valid: false,
      reason: "invalid",
    });
    expect(validateSignupEmail("founder company.com")).toEqual({
      valid: false,
      reason: "invalid",
    });
    expect(validateSignupEmail("founder@.company.com")).toEqual({
      valid: false,
      reason: "invalid",
    });
    expect(validateSignupEmail("founder@company..com")).toEqual({
      valid: false,
      reason: "invalid",
    });
  });

  it("rejects known disposable providers", () => {
    expect(validateSignupEmail("founder@mailinator.com")).toEqual({
      valid: false,
      reason: "disposable",
    });
  });

  it("recognizes Gmail addresses for the inbox shortcut", () => {
    expect(isGmailAddress("founder@gmail.com")).toBe(true);
    expect(isGmailAddress("founder@googlemail.com")).toBe(true);
    expect(isGmailAddress("founder@company.com")).toBe(false);
  });
});

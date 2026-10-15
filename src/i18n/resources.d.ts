import "i18next";
import type { resources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof resources)["pt-BR"];
    returnNull: false;
    strictKeyChecks: true;
  }
}

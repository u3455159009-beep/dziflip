import type { SmsProvider } from "./types";
import { mockSmsProvider } from "./mockProvider";
import { realSmsProvider } from "./realProvider";

export const SMS_PROVIDERS_REGISTRY: SmsProvider[] = [mockSmsProvider, realSmsProvider];

export function getSmsProvider(key: string): SmsProvider | undefined {
  return SMS_PROVIDERS_REGISTRY.find((p) => p.key === key);
}

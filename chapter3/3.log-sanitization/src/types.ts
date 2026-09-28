export type RedactionCategory =
  | "private_key"
  | "jwt"
  | "url_credential"
  | "aws_access_key"
  | "github_token"
  | "slack_token"
  | "google_api_key"
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "secret_assignment"
  | "email"
  | "credit_card"
  | "iban"
  | "us_ssn"
  | "cn_id_card"
  | "cn_phone"
  | "ip_address";

export interface RedactionRule {
  category: RedactionCategory;
  placeholder: string;
  pattern: RegExp;
  group: number | number[];
  validator?: (match: string) => boolean;
}

export interface RedactionResult {
  original: string;
  sanitized: string;
  redactions: Array<{
    category: RedactionCategory;
    originalValue: string;
    placeholder: string;
  }>;
}

export interface SanitizationSummary {
  totalRedactions: number;
  byCategory: Record<string, number>;
  samples: RedactionResult[];
}

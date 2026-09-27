/// <reference types="vite/client" />

// Set by the deploy when it builds the site for AWS. Absent in every local build,
// which is what makes the development identity the default.
interface ImportMetaEnv {
  readonly VITE_AUTH?: string;
  readonly VITE_COGNITO_ISSUER?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
}

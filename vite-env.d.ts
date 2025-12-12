/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_STRIPE_WORKER_URL?: string;
  readonly VITE_STRIPE_PUBLIC_KEY?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

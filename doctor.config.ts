import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
    rules: [
      "react-doctor/require-pnpm-hardening",
    ]
  }
})

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      JWT_SECRET: "secreto-solo-para-tests",
    },
    coverage: {
      provider: "v8",
      // La lógica que se prueba sin MongoDB, SMTP ni S3 en marcha. Las rutas
      // y lib/store/ son consultas a MongoDB: se probaron de punta a punta en
      // el navegador (ver README).
      include: [
        "lib/money.ts",
        "lib/invoice.ts",
        "lib/validation.ts",
        "lib/format.ts",
        "lib/pdf.ts",
        "lib/logo.ts",
        "lib/storage.ts",
        "lib/mail.ts",
        "lib/jwt.ts",
        "lib/next-url.ts",
        "lib/html.ts",
        "proxy.ts",
      ],
      reporter: ["text", "text-summary", "cobertura", "html"],
    },
  },
});

import { assertEquals } from "jsr:@std/assert@1";
import { deleteApp, initializeApp } from "npm:firebase-admin@13.5.0/app";
import { getAuth } from "npm:firebase-admin@13.5.0/auth";

Deno.test("Firebase Admin Auth module loads and initializes in Deno", async () => {
  const app = initializeApp(
    { projectId: "sl-community-platform" },
    "firebase-admin-deno-compatibility-probe",
  );

  try {
    const auth = getAuth(app);
    assertEquals(auth.app.options.projectId, "sl-community-platform");
  } finally {
    await deleteApp(app);
  }
});

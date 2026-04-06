require("dotenv").config();
const axios = require("axios");

const API_BASE_URL = (
  process.env.API_BASE_URL ||
  `http://localhost:${process.env.PORT || 5000}`
).replace(/\/$/, "");
const ADMIN_BEARER_TOKEN = process.env.ADMIN_BEARER_TOKEN || "";
const TEST_STUDENT_ID = process.env.TEST_STUDENT_ID || "";
const TEST_COMPARE_IMAGE_URL = process.env.TEST_COMPARE_IMAGE_URL || "";

async function main() {
  if (!ADMIN_BEARER_TOKEN) {
    throw new Error(
      "ADMIN_BEARER_TOKEN is required to smoke test /api/admin/settings/testing routes.",
    );
  }

  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `Bearer ${ADMIN_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
    validateStatus: () => true,
  });

  console.log(`\nSmoke testing tenant settings testing routes against ${API_BASE_URL}`);

  const createResponse = await client.post(
    "/api/admin/settings/testing/liveness/session",
    {},
  );
  console.log(
    "POST /api/admin/settings/testing/liveness/session ->",
    createResponse.status,
    createResponse.data?.code || createResponse.data?.session_id || "ok",
  );

  if (createResponse.status >= 400) {
    throw new Error(
      `Liveness session create failed: ${JSON.stringify(createResponse.data)}`,
    );
  }

  const sessionId = createResponse.data?.session_id;
  const fetchResponse = await client.get(
    `/api/admin/settings/testing/liveness/session/${sessionId}`,
  );
  console.log(
    "GET /api/admin/settings/testing/liveness/session/:id ->",
    fetchResponse.status,
    fetchResponse.data?.code || fetchResponse.data?.status || "ok",
  );

  if (!TEST_STUDENT_ID || !TEST_COMPARE_IMAGE_URL) {
    console.log(
      "Skipping compare smoke step because TEST_STUDENT_ID or TEST_COMPARE_IMAGE_URL is missing.",
    );
    return;
  }

  const compareResponse = await client.post("/api/admin/settings/testing/compare", {
    student_id: TEST_STUDENT_ID,
    image_url: TEST_COMPARE_IMAGE_URL,
  });
  console.log(
    "POST /api/admin/settings/testing/compare ->",
    compareResponse.status,
    compareResponse.data?.code || compareResponse.data?.decision || "ok",
  );

  if (compareResponse.status >= 400) {
    throw new Error(
      `Compare smoke test failed: ${JSON.stringify(compareResponse.data)}`,
    );
  }
}

main()
  .then(() => {
    console.log("\nTesting route smoke check completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nTesting route smoke check failed:", error.message);
    process.exit(1);
  });

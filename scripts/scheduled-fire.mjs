const url = new URL(process.env.SCHEDULED_FIRE_URL ?? "http://127.0.0.1:8787/cdn-cgi/handler/scheduled");

let response;
try {
  response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/plain, */*;q=0.1",
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scheduled:fire failed: ${message}`);
  process.exitCode = 1;
  process.exit();
}

if (!response.ok) {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  console.error(`scheduled:fire failed: ${response.status} ${response.statusText}`);
  if (body) {
    console.error(body);
  }
  process.exitCode = 1;
  process.exit();
}

console.log(`scheduled:fire ok: ${response.status} ${response.statusText}`);

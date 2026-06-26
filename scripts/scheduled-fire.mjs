const url = new URL(process.env.SCHEDULED_FIRE_URL ?? "http://127.0.0.1:8787/cdn-cgi/handler/scheduled");

const response = await fetch(url, {
  method: "GET",
  headers: {
    accept: "text/plain, */*;q=0.1",
  },
});

if (!response.ok) {
  const body = await response.text().catch(() => "");
  console.error(`scheduled:fire failed: ${response.status} ${response.statusText}`);
  if (body) {
    console.error(body);
  }
  process.exitCode = 1;
  process.exit();
}

console.log(`scheduled:fire ok: ${response.status} ${response.statusText}`);

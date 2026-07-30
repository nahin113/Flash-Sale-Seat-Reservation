const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runLoadTest() {
  console.log(`Starting load test against ${BASE_URL}...`);

  const NUM_REQUESTS = 100;
  const requests = [];

  for (let i = 1; i <= NUM_REQUESTS; i++) {
    const email = `testuser${i}@example.com`;
    const request = fetch(`${BASE_URL}/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    requests.push(request);
  }

  console.log(`Fired ${NUM_REQUESTS} simultaneous POST requests. Waiting for responses...`);

  const responses = await Promise.allSettled(requests);

  let successCount = 0;
  let errorCount = 0;
  let otherCount = 0;

  for (const result of responses) {
    if (result.status === "fulfilled") {
      const response = result.value;
      if (response.status === 201 || response.status === 200) {
        successCount++;
      } else if (response.status === 400) {
        errorCount++;
      } else {
        otherCount++;
      }
    } else {
      otherCount++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Success (201/200): ${successCount}`);
  console.log(`Expected Errors (400 - Sold Out): ${errorCount}`);
  console.log(`Other/Failures: ${otherCount}`);

  console.log(`\nChecking final status from server...`);
  const statusResponse = await fetch(`${BASE_URL}/status`);
  const statusData = await statusResponse.json();

  if (!statusResponse.ok) {
    console.error("Failed to fetch server status.", statusData);
    process.exit(1);
  }

  const { totalSeats, confirmed, held, available } = statusData.data;

  console.log("Server Status:");
  console.log(`- Total Seats: ${totalSeats}`);
  console.log(`- Confirmed: ${confirmed}`);
  console.log(`- Held: ${held}`);
  console.log(`- Available: ${available}`);
  console.log(`- Active Sum (Confirmed + Held): ${confirmed + held}`);

  let passed = true;

  if (confirmed + held > 30) {
    passed = false;
    console.error("\nFAIL: Oversold seats! (confirmed + held > 30)");
  }

  if (totalSeats !== 30) {
    passed = false;
    console.error("\nFAIL: totalSeats is not 30");
  }

  if (confirmed + held + available !== 30) {
    passed = false;
    console.error("\nFAIL: confirmed + held + available !== 30");
  }

  if (passed) {
    console.log("\nPASS: Concurrency test succeeded! No overselling occurred.");
  } else {
    process.exit(1);
  }
}

runLoadTest().catch((err) => {
  console.error("Unexpected error during load test:", err);
  process.exit(1);
});

export async function sendMessage(message) {
  const response = await fetch("http://10.3.254.11:3030/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const data = await response.json();
  return data.response;
}

export async function fetchLogs() {
  //const response = await fetch("http://10.3.254.11:3000/logs");
  //return await response.json();
  return ([]);
}

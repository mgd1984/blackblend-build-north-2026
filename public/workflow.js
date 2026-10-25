let studioBase = "http://127.0.0.1:4331/studio";
function studioUrl(record) {
  return (
    studioBase +
    (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      record.siteWorkflowId ?? "",
    )
      ? "?project=" + record.siteWorkflowId
      : "?view=projects")
  );
}
const id = new URLSearchParams(location.search).get("id");
const status = document.querySelector("#status"),
  button = document.querySelector("#approve");
let proposal, token;
async function refresh() {
  const response = await fetch("/api/workflows/" + id);
  if (!response.ok) throw new Error("Proposal unavailable.");
  proposal = await response.json();
  document.querySelector("#back").href = studioUrl(proposal);
  document.querySelector("#source").src = proposal.source;
  document.querySelector("#prompt").textContent = proposal.prompt;
  document.querySelector("#details").textContent =
    `fal · H3 Max · ${proposal.resolution} · ${proposal.referenceCount} references · source SHA-256 ${proposal.sourceHash}`;
  document.querySelector("#refs").replaceChildren(
    ...proposal.references.map((url, i) => {
      const image = new Image();
      image.src = url;
      image.alt = "Reference " + (i + 1);
      image.style.cssText = "width:120px;height:90px;object-fit:cover";
      return image;
    }),
  );
  button.disabled = proposal.status !== "awaiting_approval";
  status.textContent = proposal.error ?? proposal.status;
  if (proposal.jobId) {
    const link = document.querySelector("#result");
    link.href = studioUrl(proposal);
    link.hidden = false;
    link.textContent = "Return to project · " + proposal.jobId;
  }
}
button.addEventListener("click", async () => {
  if (!proposal || button.disabled) return;
  button.disabled = true;
  status.textContent = "Submitting once…";
  try {
    const response = await fetch("/api/workflows/" + id + "/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Local-Token": token },
      body: JSON.stringify({ confirm: true, inputHash: proposal.inputHash }),
    });
    if (!response.ok)
      throw new Error("Submission was not confirmed. Inspect history before any retry.");
    await refresh();
  } catch (error) {
    status.textContent = error.message;
  }
});
(async () => {
  try {
    const config = await (await fetch("/api/config")).json();
    token = config.token;
    studioBase = config.studioUrl;
    await refresh();
  } catch (error) {
    status.textContent = error.message;
  }
})();

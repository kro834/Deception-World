function vercelEndpoint(pathname, teamId) {
  const endpoint = new URL(pathname, "https://api.vercel.com");
  if (teamId) endpoint.searchParams.set("teamId", teamId);
  return endpoint;
}

async function readJson(response, label) {
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

/** Resolve a public Production alias to its immutable Vercel deployment. */
export async function resolveVercelProductionDeployment({
  baseUrl,
  token,
  teamId,
  projectId,
  fetchImpl = fetch,
}) {
  const expectedProjectId = typeof projectId === "string" ? projectId.trim() : "";
  if (!expectedProjectId) {
    throw new Error("VERCEL_PROJECT_ID is required to resolve Production safely");
  }
  const production = new URL(baseUrl);
  const headers = { authorization: `Bearer ${token}` };
  const aliasEndpoint = vercelEndpoint(
    `/v4/aliases/${encodeURIComponent(production.hostname)}`,
    teamId,
  );
  const alias = await readJson(
    await fetchImpl(aliasEndpoint, { headers }),
    "Vercel Production alias lookup",
  );
  const deploymentId = alias.deploymentId ?? alias.deployment?.id;
  if (typeof deploymentId !== "string" || !deploymentId.startsWith("dpl_")) {
    throw new Error("Vercel Production alias did not resolve to a deployment ID");
  }

  const deploymentEndpoint = vercelEndpoint(
    `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    teamId,
  );
  const deployment = await readJson(
    await fetchImpl(deploymentEndpoint, { headers }),
    "Vercel deployment lookup",
  );
  const deploymentProjectId = deployment.projectId ?? deployment.project?.id;
  if (deploymentProjectId !== expectedProjectId) {
    throw new Error("Vercel Production deployment does not belong to VERCEL_PROJECT_ID");
  }
  if (
    typeof deployment.projectId === "string" &&
    typeof deployment.project?.id === "string" &&
    deployment.projectId !== deployment.project.id
  ) {
    throw new Error("Vercel deployment lookup returned conflicting project identities");
  }
  const rawUrl = deployment.url;
  const shaAttributes = [
    deployment.meta?.githubCommitSha,
    deployment.meta?.gitCommitSha,
    deployment.gitSource?.sha,
  ].filter((value) => value !== undefined && value !== null);
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("Vercel deployment lookup did not return an immutable URL");
  }
  if (
    shaAttributes.length === 0 ||
    shaAttributes.some((value) => typeof value !== "string" || !/^[0-9a-f]{40}$/iu.test(value))
  ) {
    throw new Error("Vercel deployment lookup did not return a commit SHA");
  }
  const normalizedShas = shaAttributes.map((value) => value.toLowerCase());
  if (new Set(normalizedShas).size !== 1) {
    throw new Error("Vercel deployment lookup returned conflicting commit SHAs");
  }
  const [sha] = normalizedShas;
  const url = new URL(/^https?:\/\//u.test(rawUrl) ? rawUrl : `https://${rawUrl}`).origin;
  if (url === production.origin) {
    throw new Error("Vercel alias lookup did not resolve an immutable deployment URL");
  }
  return { id: deploymentId, url, sha };
}

/**
 * Fail closed unless the public Production alias still points at the exact
 * immutable deployment snapshot captured before candidate verification.
 */
export async function assertVercelProductionSnapshot({
  expectedUrl,
  expectedSha,
  ...resolveOptions
}) {
  const expectedUrlValue = String(expectedUrl).trim();
  const normalizedExpectedUrl = new URL(expectedUrlValue).origin;
  if (normalizedExpectedUrl !== expectedUrlValue) {
    throw new Error("Expected Production snapshot URL was not an immutable deployment origin");
  }
  const normalizedExpectedSha = String(expectedSha).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(normalizedExpectedSha)) {
    throw new Error("Expected Production snapshot did not include a valid commit SHA");
  }

  const current = await resolveVercelProductionDeployment(resolveOptions);
  if (current.url !== normalizedExpectedUrl || current.sha !== normalizedExpectedSha) {
    throw new Error(
      "Production changed after the release snapshot was captured; refusing promotion",
    );
  }
  return current;
}

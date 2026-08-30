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

export const VERCEL_PREVIOUS_PRODUCTION_URL_META = "archivePreviousProductionUrl";
export const VERCEL_PREVIOUS_PRODUCTION_SHA_META = "archivePreviousProductionSha";

function requiredProjectId(projectId) {
  const expectedProjectId = typeof projectId === "string" ? projectId.trim() : "";
  if (!expectedProjectId) {
    throw new Error("VERCEL_PROJECT_ID is required to resolve Production safely");
  }
  return expectedProjectId;
}

function immutableOrigin(value, label) {
  const raw = typeof value === "string" ? value.trim() : "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} did not contain a valid immutable URL`);
  }
  if (parsed.protocol !== "https:" || parsed.origin !== raw) {
    throw new Error(`${label} did not contain an HTTPS deployment origin`);
  }
  return parsed.origin;
}

function aliasDeploymentId(alias) {
  const ids = [alias.deploymentId, alias.deployment?.id].filter(
    (value) => value !== undefined && value !== null,
  );
  if (
    ids.length === 0 ||
    ids.some((value) => typeof value !== "string" || !/^dpl_[A-Za-z0-9_-]+$/u.test(value))
  ) {
    throw new Error("Vercel Production alias did not resolve to a deployment ID");
  }
  if (new Set(ids).size !== 1) {
    throw new Error("Vercel Production alias returned conflicting deployment IDs");
  }
  return ids[0];
}

function deploymentIdentity(deployment, identifier, expectedProjectId) {
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
  if (
    deployment.id !== undefined &&
    (typeof deployment.id !== "string" || !/^dpl_[A-Za-z0-9_-]+$/u.test(deployment.id))
  ) {
    throw new Error("Vercel deployment lookup returned an invalid deployment ID");
  }
  if (/^dpl_/u.test(identifier) && deployment.id && deployment.id !== identifier) {
    throw new Error("Vercel deployment lookup returned a conflicting deployment ID");
  }
  const deploymentId = deployment.id ?? (/^dpl_/u.test(identifier) ? identifier : undefined);
  if (typeof deploymentId !== "string" || !deploymentId.startsWith("dpl_")) {
    throw new Error("Vercel deployment lookup did not return a deployment ID");
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
  const rawDeploymentUrl = /^https?:\/\//u.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const url = immutableOrigin(new URL(rawDeploymentUrl).origin, "Vercel deployment lookup");
  return { id: deploymentId, url, sha: normalizedShas[0] };
}

async function resolveVercelDeploymentRecord({ identifier, token, teamId, projectId, fetchImpl }) {
  const expectedProjectId = requiredProjectId(projectId);
  const endpoint = vercelEndpoint(`/v13/deployments/${encodeURIComponent(identifier)}`, teamId);
  const deployment = await readJson(
    await fetchImpl(endpoint, { headers: { authorization: `Bearer ${token}` } }),
    "Vercel deployment lookup",
  );
  return {
    identity: deploymentIdentity(deployment, identifier, expectedProjectId),
    meta: deployment.meta && typeof deployment.meta === "object" ? deployment.meta : {},
  };
}

/** Resolve a public Production alias to its immutable Vercel deployment. */
export async function resolveVercelProductionDeployment({
  baseUrl,
  token,
  teamId,
  projectId,
  fetchImpl = fetch,
}) {
  requiredProjectId(projectId);
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
  const deploymentId = aliasDeploymentId(alias);

  const { identity } = await resolveVercelDeploymentRecord({
    identifier: deploymentId,
    token,
    teamId,
    projectId,
    fetchImpl,
  });
  if (identity.url === production.origin) {
    throw new Error("Vercel alias lookup did not resolve an immutable deployment URL");
  }
  return identity;
}

/**
 * Attest that a staged candidate carries the exact rollback metadata captured
 * from Production. Promotion must not proceed when Vercel omitted or changed
 * either value, or when either deployment belongs to a different project.
 */
export async function assertVercelCandidateRollbackMetadata({
  candidateUrl,
  candidateSha,
  previousUrl,
  previousSha,
  token,
  teamId,
  projectId,
  fetchImpl = fetch,
}) {
  const expectedCandidateUrl = immutableOrigin(candidateUrl, "Candidate deployment");
  const expectedPreviousUrl = immutableOrigin(previousUrl, "Previous Production snapshot");
  const expectedCandidateSha = String(candidateSha).trim().toLowerCase();
  const expectedPreviousSha = String(previousSha).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(expectedCandidateSha)) {
    throw new Error("Candidate deployment did not include a valid commit SHA");
  }
  if (!/^[0-9a-f]{40}$/u.test(expectedPreviousSha)) {
    throw new Error("Previous Production snapshot did not include a valid commit SHA");
  }
  if (expectedCandidateUrl === expectedPreviousUrl) {
    throw new Error("Candidate deployment points to the previous Production deployment");
  }

  const candidateRecord = await resolveVercelDeploymentRecord({
    identifier: new URL(expectedCandidateUrl).hostname,
    token,
    teamId,
    projectId,
    fetchImpl,
  });
  if (
    candidateRecord.identity.url !== expectedCandidateUrl ||
    candidateRecord.identity.sha !== expectedCandidateSha
  ) {
    throw new Error("Candidate deployment does not match the Vercel deployment record");
  }
  if (
    candidateRecord.meta[VERCEL_PREVIOUS_PRODUCTION_URL_META] !== expectedPreviousUrl ||
    candidateRecord.meta[VERCEL_PREVIOUS_PRODUCTION_SHA_META] !== expectedPreviousSha
  ) {
    throw new Error("Candidate deployment rollback metadata is missing or does not match");
  }

  const previousRecord = await resolveVercelDeploymentRecord({
    identifier: new URL(expectedPreviousUrl).hostname,
    token,
    teamId,
    projectId,
    fetchImpl,
  });
  if (
    previousRecord.identity.url !== expectedPreviousUrl ||
    previousRecord.identity.sha !== expectedPreviousSha
  ) {
    throw new Error("Previous Production snapshot does not match the Vercel deployment record");
  }
  if (candidateRecord.identity.id === previousRecord.identity.id) {
    throw new Error("Candidate deployment points to the previous Production deployment");
  }
  return candidateRecord.identity;
}

/**
 * Resolve the only rollback target authorized by metadata on the failed
 * Production deployment. This rechecks the alias snapshot and both deployments
 * against the same Vercel project before returning a mutation target.
 */
export async function resolveVercelRollbackTarget({
  baseUrl,
  failedDeploymentId,
  failedUrl,
  failedSha,
  token,
  teamId,
  projectId,
  fetchImpl = fetch,
}) {
  const expectedFailedUrl = immutableOrigin(failedUrl, "Failed Production snapshot");
  const expectedFailedSha = String(failedSha).trim().toLowerCase();
  if (!/^dpl_[A-Za-z0-9_-]+$/u.test(String(failedDeploymentId))) {
    throw new Error("Failed Production snapshot did not include a deployment ID");
  }
  if (!/^[0-9a-f]{40}$/u.test(expectedFailedSha)) {
    throw new Error("Failed Production snapshot did not include a valid commit SHA");
  }

  const production = new URL(baseUrl);
  const alias = await readJson(
    await fetchImpl(
      vercelEndpoint(`/v4/aliases/${encodeURIComponent(production.hostname)}`, teamId),
      { headers: { authorization: `Bearer ${token}` } },
    ),
    "Vercel Production alias lookup",
  );
  const currentId = aliasDeploymentId(alias);
  if (currentId !== failedDeploymentId) {
    throw new Error("Production changed after monitoring; refusing a stale rollback");
  }
  const failedRecord = await resolveVercelDeploymentRecord({
    identifier: currentId,
    token,
    teamId,
    projectId,
    fetchImpl,
  });
  if (
    failedRecord.identity.url !== expectedFailedUrl ||
    failedRecord.identity.sha !== expectedFailedSha
  ) {
    throw new Error("Production changed after monitoring; refusing a stale rollback");
  }

  const rawPreviousUrl = failedRecord.meta[VERCEL_PREVIOUS_PRODUCTION_URL_META];
  const rawPreviousSha = failedRecord.meta[VERCEL_PREVIOUS_PRODUCTION_SHA_META];
  if (typeof rawPreviousUrl !== "string" || typeof rawPreviousSha !== "string") {
    throw new Error(
      "Failed deployment has no exact previous Production metadata; refusing unsafe rollback",
    );
  }
  const previousUrl = immutableOrigin(rawPreviousUrl, "Previous Production metadata");
  const previousSha = rawPreviousSha.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(previousSha)) {
    throw new Error("Previous Production metadata did not include a valid commit SHA");
  }
  if (previousUrl === expectedFailedUrl) {
    throw new Error("Previous Production metadata points back to the failed deployment");
  }

  const previousRecord = await resolveVercelDeploymentRecord({
    identifier: new URL(previousUrl).hostname,
    token,
    teamId,
    projectId,
    fetchImpl,
  });
  if (previousRecord.identity.url !== previousUrl || previousRecord.identity.sha !== previousSha) {
    throw new Error("Previous Production metadata does not match the Vercel deployment record");
  }
  if (previousRecord.identity.id === failedRecord.identity.id) {
    throw new Error("Previous Production metadata points back to the failed deployment");
  }
  return previousRecord.identity;
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

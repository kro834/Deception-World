import assert from "node:assert/strict";
import test from "node:test";
import {
  assertVercelProductionSnapshot,
  resolveVercelProductionDeployment,
} from "./vercel-production-deployment.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const PROJECT_ID = "prj_archive";

test("Production lookup resolves a public alias before inspecting the immutable deployment", async () => {
  const seen = [];
  const result = await resolveVercelProductionDeployment({
    baseUrl: "https://archive.example/path",
    token: "secret",
    teamId: "team_example",
    projectId: PROJECT_ID,
    fetchImpl: async (input, init) => {
      const url = new URL(input);
      seen.push({ url, init });
      if (url.pathname.startsWith("/v4/aliases/")) {
        return Response.json({ deploymentId: "dpl_previous" });
      }
      return Response.json({
        projectId: PROJECT_ID,
        url: "immutable-previous.vercel.app",
        meta: { githubCommitSha: SHA.toUpperCase(), gitCommitSha: SHA },
        gitSource: { sha: SHA },
      });
    },
  });

  assert.deepEqual(result, {
    id: "dpl_previous",
    url: "https://immutable-previous.vercel.app",
    sha: SHA,
  });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url.pathname, "/v4/aliases/archive.example");
  assert.equal(seen[1].url.pathname, "/v13/deployments/dpl_previous");
  assert.ok(seen.every(({ url }) => url.searchParams.get("teamId") === "team_example"));
  assert.ok(seen.every(({ init }) => init.headers.authorization === "Bearer secret"));
});

test("Production lookup fails closed when alias metadata is not immutable", async () => {
  await assert.rejects(
    resolveVercelProductionDeployment({
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl: async () => Response.json({ alias: "archive.example" }),
    }),
    /did not resolve to a deployment ID/,
  );
});

test("Production lookup requires and verifies the Vercel project identity", async () => {
  await assert.rejects(
    resolveVercelProductionDeployment({
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      fetchImpl: async () => {
        throw new Error("fetch must not run without a project fence");
      },
    }),
    /VERCEL_PROJECT_ID is required/,
  );

  await assert.rejects(
    resolveVercelProductionDeployment({
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl: async (input) => {
        const url = new URL(input);
        if (url.pathname.startsWith("/v4/aliases/")) {
          return Response.json({ deploymentId: "dpl_foreign" });
        }
        return Response.json({
          projectId: "prj_foreign",
          url: "foreign.vercel.app",
          meta: { githubCommitSha: SHA },
        });
      },
    }),
    /does not belong to VERCEL_PROJECT_ID/,
  );
});

test("Production lookup fails closed when Vercel SHA attributes disagree", async () => {
  let deploymentPayload = {
    projectId: PROJECT_ID,
    url: "conflict.vercel.app",
    meta: { githubCommitSha: SHA },
    gitSource: { sha: "fedcba9876543210fedcba9876543210fedcba98" },
  };
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname.startsWith("/v4/aliases/")) {
      return Response.json({ deploymentId: "dpl_conflict" });
    }
    return Response.json(deploymentPayload);
  };
  await assert.rejects(
    resolveVercelProductionDeployment({
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl,
    }),
    /conflicting commit SHAs/,
  );

  deploymentPayload = {
    ...deploymentPayload,
    meta: { githubCommitSha: 123, gitCommitSha: SHA },
    gitSource: undefined,
  };
  await assert.rejects(
    resolveVercelProductionDeployment({
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl,
    }),
    /did not return a commit SHA/,
  );
});

test("Production lookup accepts the nested project shape but rejects conflicting identities", async () => {
  let deploymentPayload = {
    project: { id: PROJECT_ID },
    url: "nested-project.vercel.app",
    meta: { githubCommitSha: SHA },
  };
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname.startsWith("/v4/aliases/")) {
      return Response.json({ deploymentId: "dpl_nested" });
    }
    return Response.json(deploymentPayload);
  };

  const result = await resolveVercelProductionDeployment({
    baseUrl: "https://archive.example",
    token: "secret",
    teamId: "team_example",
    projectId: PROJECT_ID,
    fetchImpl,
  });
  assert.equal(result.id, "dpl_nested");

  deploymentPayload = {
    ...deploymentPayload,
    projectId: PROJECT_ID,
    project: { id: "prj_conflict" },
  };
  await assert.rejects(
    resolveVercelProductionDeployment({
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl,
    }),
    /conflicting project identities/,
  );
});

test("Production snapshot fence accepts only the exact captured URL and SHA", async () => {
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname.startsWith("/v4/aliases/")) {
      return Response.json({ deploymentId: "dpl_previous" });
    }
    return Response.json({
      projectId: PROJECT_ID,
      url: "immutable-previous.vercel.app",
      meta: { githubCommitSha: SHA },
    });
  };
  const options = {
    baseUrl: "https://archive.example",
    token: "secret",
    teamId: "team_example",
    projectId: PROJECT_ID,
    fetchImpl,
  };

  const current = await assertVercelProductionSnapshot({
    ...options,
    expectedUrl: "https://immutable-previous.vercel.app",
    expectedSha: SHA.toUpperCase(),
  });
  assert.deepEqual(current, {
    id: "dpl_previous",
    url: "https://immutable-previous.vercel.app",
    sha: SHA,
  });

  await assert.rejects(
    assertVercelProductionSnapshot({
      ...options,
      expectedUrl: "https://another-deployment.vercel.app",
      expectedSha: SHA,
    }),
    /Production changed after the release snapshot was captured/u,
  );
  await assert.rejects(
    assertVercelProductionSnapshot({
      ...options,
      expectedUrl: "https://immutable-previous.vercel.app",
      expectedSha: "fedcba9876543210fedcba9876543210fedcba98",
    }),
    /Production changed after the release snapshot was captured/u,
  );
  await assert.rejects(
    assertVercelProductionSnapshot({
      ...options,
      expectedUrl: "https://immutable-previous.vercel.app/not-an-origin",
      expectedSha: SHA,
    }),
    /not an immutable deployment origin/u,
  );
});

test("Production snapshot fence rejects an invalid captured SHA before lookup", async () => {
  await assert.rejects(
    assertVercelProductionSnapshot({
      expectedUrl: "https://immutable-previous.vercel.app",
      expectedSha: "not-a-sha",
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl: async () => {
        throw new Error("fetch must not run for invalid snapshot input");
      },
    }),
    /valid commit SHA/u,
  );
});

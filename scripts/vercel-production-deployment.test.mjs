import assert from "node:assert/strict";
import test from "node:test";
import {
  assertVercelCandidateRollbackMetadata,
  assertVercelBootstrapCandidate,
  assertVercelProductionSnapshot,
  resolveVercelRollbackTarget,
  resolveVercelProductionDeployment,
  switchVercelProduction,
  VERCEL_PREVIOUS_PRODUCTION_SHA_META,
  VERCEL_PREVIOUS_PRODUCTION_URL_META,
} from "./vercel-production-deployment.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const PREVIOUS_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const PROJECT_ID = "prj_archive";

test("production switching uses the team-scoped API only after exact deployment attestation", async () => {
  for (const action of ["promote", "rollback"]) {
    const seen = [];
    await switchVercelProduction({ action, deploymentId: "dpl_candidate", deploymentUrl: "https://candidate.vercel.app", deploymentSha: SHA,
      token: "secret", teamId: "team_example", projectId: PROJECT_ID, fetchImpl: async (input, init) => {
        seen.push({ url: new URL(input), init });
        return init.method === "POST" ? new Response(null, { status: 202 }) : Response.json({ id: "dpl_candidate", projectId: PROJECT_ID, url: "candidate.vercel.app", meta: { githubCommitSha: SHA } });
      } });
    assert.equal(seen.length, 2);
    assert.equal(seen[1].url.pathname, `/${action === "promote" ? "v10" : "v9"}/projects/${PROJECT_ID}/${action}/dpl_candidate`);
    assert.equal(seen[1].init.body, "{}");
    assert.ok(seen.every(({ url, init }) => url.searchParams.get("teamId") === "team_example" && init.headers.authorization === "Bearer secret"));
  }
});

test("production switching rejects wrong IDs and denied requests without broadening scope", async () => {
  const options = { deploymentId: "dpl_candidate", deploymentUrl: "https://candidate.vercel.app", deploymentSha: SHA,
    token: "secret", teamId: "team_example", projectId: PROJECT_ID };
  let writes = 0;
  const record = { id: "dpl_candidate", projectId: PROJECT_ID, url: "candidate.vercel.app", meta: { githubCommitSha: SHA } };
  const fetchImpl = async (_input, init) => {
    if (init.method === "POST") { writes++; return new Response(null, { status: 403 }); }
    return Response.json(record);
  };
  await assert.rejects(switchVercelProduction({ ...options, action: "delete", fetchImpl }), /Invalid Production switch action/);
  await assert.rejects(switchVercelProduction({ ...options, deploymentId: "dpl_other", fetchImpl }), /ID/);
  await assert.rejects(switchVercelProduction({ ...options, projectId: "prj_other", fetchImpl }), /does not belong/);
  assert.equal(writes, 0);
  await assert.rejects(switchVercelProduction({ ...options, fetchImpl }), /HTTP 403/);
  assert.equal(writes, 1);
});

test("first publication requires an authenticated, verified project domain", async () => {
  const options = { baseUrl: "https://new.vercel.app", projectId: PROJECT_ID, teamId: "team_example", token: "secret", allowUnpublished: true };
  assert.equal(await resolveVercelProductionDeployment({ ...options, fetchImpl: async input =>
    new URL(input).pathname.startsWith('/v4/aliases/') ? new Response('', { status: 404 }) : Response.json({ name: 'new.vercel.app', verified: true }) }), null);
  for (const status of [401, 403, 500]) {
    await assert.rejects(resolveVercelProductionDeployment({ ...options, fetchImpl: async () => new Response('', { status }) }), /alias lookup failed/);
  }
  await assert.rejects(resolveVercelProductionDeployment({ ...options, fetchImpl: async input =>
    new URL(input).pathname.startsWith('/v4/aliases/') ? new Response('', { status: 404 }) : Response.json({ name: 'other.vercel.app', verified: true }) }), /not verified/);
  await assert.rejects(resolveVercelProductionDeployment({ ...options, fetchImpl: async () => new Response('', { status: 404 }) }), /domain lookup failed/);
});

test("bootstrap candidate must attest the exact project, immutable URL and main SHA", async () => {
  const options = { candidateUrl: "https://candidate.vercel.app", candidateSha: SHA, projectId: PROJECT_ID };
  const record = { id: 'dpl_candidate', projectId: PROJECT_ID, url: 'candidate.vercel.app', meta: { githubCommitSha: SHA } };
  assert.equal((await assertVercelBootstrapCandidate({ ...options, fetchImpl: async () => Response.json(record) })).sha, SHA);
  await assert.rejects(assertVercelBootstrapCandidate({ ...options, candidateSha: PREVIOUS_SHA, fetchImpl: async () => Response.json(record) }), /expected main commit/);
  await assert.rejects(assertVercelBootstrapCandidate({ ...options, projectId: 'prj_other', fetchImpl: async () => Response.json(record) }), /does not belong/);
  await assert.rejects(assertVercelProductionSnapshot({ ...options, baseUrl: 'https://new.vercel.app', expectedUrl: '', expectedSha: '', allowUnpublished: true, fetchImpl: async input =>
    new URL(input).pathname.startsWith('/v4/aliases/') ? Response.json({ deploymentId: 'dpl_candidate' }) : Response.json(record) }), /appeared during bootstrap/);
});

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

test("Production lookup rejects conflicting alias and deployment IDs", async () => {
  await assert.rejects(
    resolveVercelProductionDeployment({
      baseUrl: "https://archive.example",
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl: async () =>
        Response.json({ deploymentId: "dpl_expected", deployment: { id: "dpl_other" } }),
    }),
    /conflicting deployment IDs/u,
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
          return Response.json({ deploymentId: "dpl_expected" });
        }
        return Response.json({
          id: "dpl_other",
          projectId: PROJECT_ID,
          url: "unexpected.vercel.app",
          meta: { githubCommitSha: SHA },
        });
      },
    }),
    /conflicting deployment ID/u,
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

test("candidate promotion metadata is exact and API-attested before promotion", async () => {
  const seen = [];
  const candidate = await assertVercelCandidateRollbackMetadata({
    candidateUrl: "https://candidate-release.vercel.app",
    candidateSha: SHA.toUpperCase(),
    previousUrl: "https://exact-previous.vercel.app",
    previousSha: PREVIOUS_SHA.toUpperCase(),
    token: "secret",
    teamId: "team_example",
    projectId: PROJECT_ID,
    fetchImpl: async (input) => {
      const url = new URL(input);
      seen.push(url.pathname);
      if (url.pathname.endsWith("/candidate-release.vercel.app")) {
        return Response.json({
          id: "dpl_candidate",
          projectId: PROJECT_ID,
          url: "candidate-release.vercel.app",
          meta: {
            githubCommitSha: SHA,
            [VERCEL_PREVIOUS_PRODUCTION_URL_META]: "https://exact-previous.vercel.app",
            [VERCEL_PREVIOUS_PRODUCTION_SHA_META]: PREVIOUS_SHA,
          },
        });
      }
      return Response.json({
        id: "dpl_exact_previous",
        projectId: PROJECT_ID,
        url: "exact-previous.vercel.app",
        meta: { githubCommitSha: PREVIOUS_SHA },
      });
    },
  });

  assert.deepEqual(candidate, {
    id: "dpl_candidate",
    url: "https://candidate-release.vercel.app",
    sha: SHA,
  });
  assert.deepEqual(seen, [
    "/v13/deployments/candidate-release.vercel.app",
    "/v13/deployments/exact-previous.vercel.app",
  ]);
});

test("candidate promotion fails closed when rollback metadata is absent or tampered", async () => {
  for (const metadata of [
    { githubCommitSha: SHA },
    {
      githubCommitSha: SHA,
      [VERCEL_PREVIOUS_PRODUCTION_URL_META]: "https://tampered.vercel.app",
      [VERCEL_PREVIOUS_PRODUCTION_SHA_META]: PREVIOUS_SHA,
    },
    {
      githubCommitSha: SHA,
      [VERCEL_PREVIOUS_PRODUCTION_URL_META]: "https://exact-previous.vercel.app",
      [VERCEL_PREVIOUS_PRODUCTION_SHA_META]: SHA,
    },
  ]) {
    let calls = 0;
    await assert.rejects(
      assertVercelCandidateRollbackMetadata({
        candidateUrl: "https://candidate-release.vercel.app",
        candidateSha: SHA,
        previousUrl: "https://exact-previous.vercel.app",
        previousSha: PREVIOUS_SHA,
        token: "secret",
        teamId: "team_example",
        projectId: PROJECT_ID,
        fetchImpl: async () => {
          calls += 1;
          return Response.json({
            id: "dpl_candidate",
            projectId: PROJECT_ID,
            url: "candidate-release.vercel.app",
            meta: metadata,
          });
        },
      }),
      /rollback metadata is missing or does not match/u,
    );
    assert.equal(calls, 1, "a bad candidate must fail before the rollback target lookup");
  }
});

test("rollback target comes only from failed deployment metadata and is API-attested", async () => {
  const seen = [];
  const target = await resolveVercelRollbackTarget({
    baseUrl: "https://archive.example",
    failedDeploymentId: "dpl_failed",
    failedUrl: "https://failed-release.vercel.app",
    failedSha: SHA,
    token: "secret",
    teamId: "team_example",
    projectId: PROJECT_ID,
    fetchImpl: async (input, init) => {
      const url = new URL(input);
      seen.push({ url, init });
      if (url.pathname.startsWith("/v4/aliases/")) {
        return Response.json({ deploymentId: "dpl_failed" });
      }
      if (url.pathname.endsWith("/dpl_failed")) {
        return Response.json({
          id: "dpl_failed",
          projectId: PROJECT_ID,
          url: "failed-release.vercel.app",
          meta: {
            githubCommitSha: SHA,
            [VERCEL_PREVIOUS_PRODUCTION_URL_META]: "https://exact-previous.vercel.app",
            [VERCEL_PREVIOUS_PRODUCTION_SHA_META]: PREVIOUS_SHA.toUpperCase(),
          },
        });
      }
      assert.equal(url.pathname, "/v13/deployments/exact-previous.vercel.app");
      return Response.json({
        id: "dpl_exact_previous",
        project: { id: PROJECT_ID },
        url: "exact-previous.vercel.app",
        meta: { githubCommitSha: PREVIOUS_SHA },
      });
    },
  });

  assert.deepEqual(target, {
    id: "dpl_exact_previous",
    url: "https://exact-previous.vercel.app",
    sha: PREVIOUS_SHA,
  });
  assert.equal(seen.length, 3);
  assert.ok(seen.every(({ url }) => url.searchParams.get("teamId") === "team_example"));
  assert.ok(seen.every(({ init }) => init.headers.authorization === "Bearer secret"));
});

test("rollback fails closed when an older failed deployment has no previous metadata", async () => {
  let calls = 0;
  await assert.rejects(
    resolveVercelRollbackTarget({
      baseUrl: "https://archive.example",
      failedDeploymentId: "dpl_legacy",
      failedUrl: "https://legacy-release.vercel.app",
      failedSha: SHA,
      token: "secret",
      teamId: "team_example",
      projectId: PROJECT_ID,
      fetchImpl: async (input) => {
        calls += 1;
        const url = new URL(input);
        if (url.pathname.startsWith("/v4/aliases/")) {
          return Response.json({ deploymentId: "dpl_legacy" });
        }
        return Response.json({
          id: "dpl_legacy",
          projectId: PROJECT_ID,
          url: "legacy-release.vercel.app",
          meta: { githubCommitSha: SHA },
        });
      },
    }),
    /no exact previous Production metadata; refusing unsafe rollback/u,
  );
  assert.equal(calls, 2, "no implicit rollback target may be looked up");
});

test("rollback rejects stale aliases and mismatched previous deployment attestations", async () => {
  const baseOptions = {
    baseUrl: "https://archive.example",
    failedDeploymentId: "dpl_failed",
    failedUrl: "https://failed-release.vercel.app",
    failedSha: SHA,
    token: "secret",
    teamId: "team_example",
    projectId: PROJECT_ID,
  };
  await assert.rejects(
    resolveVercelRollbackTarget({
      ...baseOptions,
      fetchImpl: async () => Response.json({ deploymentId: "dpl_newer" }),
    }),
    /Production changed after monitoring/u,
  );

  await assert.rejects(
    resolveVercelRollbackTarget({
      ...baseOptions,
      fetchImpl: async (input) => {
        const url = new URL(input);
        if (url.pathname.startsWith("/v4/aliases/")) {
          return Response.json({ deploymentId: "dpl_failed" });
        }
        if (url.pathname.endsWith("/dpl_failed")) {
          return Response.json({
            id: "dpl_failed",
            projectId: PROJECT_ID,
            url: "failed-release.vercel.app",
            meta: {
              githubCommitSha: SHA,
              [VERCEL_PREVIOUS_PRODUCTION_URL_META]: "https://exact-previous.vercel.app",
              [VERCEL_PREVIOUS_PRODUCTION_SHA_META]: PREVIOUS_SHA,
            },
          });
        }
        return Response.json({
          id: "dpl_exact_previous",
          projectId: "prj_foreign",
          url: "exact-previous.vercel.app",
          meta: { githubCommitSha: PREVIOUS_SHA },
        });
      },
    }),
    /does not belong to VERCEL_PROJECT_ID/u,
  );
});

test("rollback rejects tampered previous URL or SHA metadata", async () => {
  for (const previousDeployment of [
    {
      id: "dpl_exact_previous",
      projectId: PROJECT_ID,
      url: "different-previous.vercel.app",
      meta: { githubCommitSha: PREVIOUS_SHA },
    },
    {
      id: "dpl_exact_previous",
      projectId: PROJECT_ID,
      url: "exact-previous.vercel.app",
      meta: { githubCommitSha: SHA },
    },
  ]) {
    await assert.rejects(
      resolveVercelRollbackTarget({
        baseUrl: "https://archive.example",
        failedDeploymentId: "dpl_failed",
        failedUrl: "https://failed-release.vercel.app",
        failedSha: SHA,
        token: "secret",
        teamId: "team_example",
        projectId: PROJECT_ID,
        fetchImpl: async (input) => {
          const url = new URL(input);
          if (url.pathname.startsWith("/v4/aliases/")) {
            return Response.json({ deploymentId: "dpl_failed" });
          }
          if (url.pathname.endsWith("/dpl_failed")) {
            return Response.json({
              id: "dpl_failed",
              projectId: PROJECT_ID,
              url: "failed-release.vercel.app",
              meta: {
                githubCommitSha: SHA,
                [VERCEL_PREVIOUS_PRODUCTION_URL_META]: "https://exact-previous.vercel.app",
                [VERCEL_PREVIOUS_PRODUCTION_SHA_META]: PREVIOUS_SHA,
              },
            });
          }
          return Response.json(previousDeployment);
        },
      }),
      /does not match the Vercel deployment record/u,
    );
  }
});

test("rollback permits an exact previous deployment of the same commit", async () => {
  const target = await resolveVercelRollbackTarget({
    baseUrl: "https://archive.example",
    failedDeploymentId: "dpl_failed",
    failedUrl: "https://failed-release.vercel.app",
    failedSha: SHA,
    token: "secret",
    teamId: "team_example",
    projectId: PROJECT_ID,
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname.startsWith("/v4/aliases/")) {
        return Response.json({ deploymentId: "dpl_failed" });
      }
      if (url.pathname.endsWith("/dpl_failed")) {
        return Response.json({
          id: "dpl_failed",
          projectId: PROJECT_ID,
          url: "failed-release.vercel.app",
          meta: {
            githubCommitSha: SHA,
            [VERCEL_PREVIOUS_PRODUCTION_URL_META]: "https://exact-previous.vercel.app",
            [VERCEL_PREVIOUS_PRODUCTION_SHA_META]: SHA,
          },
        });
      }
      return Response.json({
        id: "dpl_exact_previous",
        projectId: PROJECT_ID,
        url: "exact-previous.vercel.app",
        meta: { githubCommitSha: SHA },
      });
    },
  });
  assert.equal(target.id, "dpl_exact_previous");
  assert.equal(target.sha, SHA);
});

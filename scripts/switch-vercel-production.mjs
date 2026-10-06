import { setTimeout as delay } from 'node:timers/promises';
import { switchVercelProduction, assertVercelProductionSnapshot } from './vercel-production-deployment.mjs';

const [action, deploymentId, deploymentUrl, deploymentSha] = process.argv.slice(2);
const options = {
  token: process.env.VERCEL_TOKEN,
  teamId: process.env.VERCEL_ORG_ID,
  projectId: process.env.VERCEL_PROJECT_ID,
};
await switchVercelProduction({ ...options, action, deploymentId, deploymentUrl, deploymentSha });
let confirmed = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    await assertVercelProductionSnapshot({ ...options, baseUrl: process.env.PUBLIC_BASE_URL, expectedUrl: deploymentUrl, expectedSha: deploymentSha });
    confirmed = true;
    break;
  } catch {
    await delay(5000);
  }
}
if (!confirmed) throw new Error('Production alias did not reach the attested deployment within five minutes');
console.log(`Production ${action} verified: ${deploymentSha}`);

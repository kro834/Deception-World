// Explicit fault-condition runner, not evidence of healthy external delivery.
import { chromium } from "playwright";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const create = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const context = await create(...options);
    await context.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|grok\.com)\//, route => route.abort("internetdisconnected"));
    return context;
  };
  return browser;
};
console.log("AUDIT NETWORK MODE: external-font-outage-controlled");
process.env.AUDIT_OFFLINE_FONTS = "1";
await import(pathToFileURL(resolve(process.argv[2])).href);

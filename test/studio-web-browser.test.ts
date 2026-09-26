import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";

const studioPackage = createRequire(path.resolve("apps/studio-web/package.json"));

test("Studio em português orienta a criação e preserva conceitos após reload e undo", { timeout: 120000 }, async (t) => {
  if (process.env.BUNKERCODE_BROWSER_TEST !== "1") { t.skip("Set BUNKERCODE_BROWSER_TEST=1 to run the Studio browser smoke test."); return; }
  const { createServer } = await import(studioPackage.resolve("vite"));
  const server = await createServer({ root: path.resolve("apps/studio-web"), server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  t.after(() => server.close());
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== "string");
  const browser = await puppeteer.launch({ browser: "firefox", executablePath: process.env.BUNKERCODE_BROWSER_EXECUTABLE ?? "/usr/bin/firefox", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".react-flow__pane");
  assert.match(await page.$eval(".empty-guidance", (element) => element.textContent ?? ""), /Comece pelo que você já sabe/);

  async function addConcept(x: number, y: number, kind: string, name: string) {
    await page.mouse.click(x, y); await page.mouse.click(x, y);
    await page.waitForSelector(".create-menu");
    const chosen = await page.$$eval(".create-menu button", (buttons, label) => { const button = buttons.find((item) => item.querySelector("strong")?.textContent === label); button?.click(); return !!button; }, kind);
    assert.ok(chosen, `${kind} is available`);
    await page.waitForSelector(".concept-name-input");
    await page.type(".concept-name-input", name);
    await page.keyboard.press("Enter");
  }
  await page.mouse.click(500, 300); await page.mouse.click(500, 300);
  await page.waitForSelector(".create-menu");
  assert.match(await page.$eval(".create-menu", (element) => element.textContent ?? ""), /O que você quer adicionar/);
  assert.equal(await page.$eval(".create-menu button:nth-of-type(2) strong", (element) => element.textContent), "Processa alguma coisa");
  assert.equal(await page.$eval(".create-menu button:nth-of-type(2) .menu-technical", (element) => element.textContent), "Component");
  await page.$$eval(".create-menu button", (buttons) => buttons.find((button) => button.querySelector("strong")?.textContent === "Processa alguma coisa")?.click());
  await page.waitForSelector(".concept-name-input");
  await page.type(".concept-name-input", "Authentication"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector(".empty-guidance"));
  await addConcept(850, 460, "Armazena informações", "User Database");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").design?.entities?.[1]?.name === "User Database");

  const handles = await page.$$eval(".react-flow__node", (elements) => elements.map((element) => {
    const source = element.querySelector(".react-flow__handle-bottom")?.getBoundingClientRect();
    const target = element.querySelector(".react-flow__handle-top")?.getBoundingClientRect();
    return { source: source ? { x: source.x + source.width / 2, y: source.y + source.height / 2 } : null,
      target: target ? { x: target.x + target.width / 2, y: target.y + target.height / 2 } : null };
  }));
  assert.ok(handles[0]?.source && handles[1]?.target);
  await page.mouse.move(handles[0].source.x, handles[0].source.y); await page.mouse.down();
  await page.mouse.move(handles[1].target.x, handles[1].target.y, { steps: 15 }); await page.mouse.up();
  await page.waitForSelector(".connection-menu");
  await page.$$eval(".connection-menu button", (buttons) => buttons.find((button) => button.querySelector("strong")?.textContent === "Lê / grava dados")?.click());
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").design?.relationships?.[0]?.kind === "reads-writes");

  await page.click(".react-flow__edge-interaction");
  await page.waitForSelector(".edge-understanding");
  assert.match(await page.$eval(".edge-understanding", (element) => element.textContent ?? ""), /Authentication → User Database/);

  await page.click(".react-flow__node:first-child .concept-node");
  await page.waitForSelector(".node-understanding");
  const card = await page.$eval(".node-understanding", (element) => element.textContent ?? "");
  assert.match(card, /Authentication/); assert.match(card, /User Database/); assert.match(card, /Pontos para considerar/);
  assert.match(card, /Processa alguma coisa/); assert.match(card, /Component/);
  assert.doesNotMatch(card, /textarea/i);
  await page.$$eval(".node-understanding button", (buttons) => buttons.find((button) => button.textContent?.includes("ainda não revisados"))?.click());
  await page.waitForSelector(".consideration-list");
  assert.match(await page.$eval(".consideration-list", (element) => element.textContent ?? ""), /Ainda não revisado/);
  await page.click(".consideration-list button");
  await page.waitForSelector(".consideration-detail");
  assert.match(await page.$eval(".consideration-detail", (element) => element.textContent ?? ""), /Por que isso importa/);
  await page.$$eval(".consideration-detail button", (buttons) => buttons.find((button) => button.textContent === "Marcar como considerado")?.click());
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").design?.entities?.[0]?.considerationStates ?? {}).includes("considered"));
  await page.click(".close-button");
  await page.click(".react-flow__node:first-child .concept-node");
  await page.$$eval(".node-understanding button", (buttons) => buttons.find((button) => button.textContent?.includes("Adicionar decisão"))?.click());
  await page.waitForSelector(".detail-panel");
  await page.type(".detail-panel input", "Use sessions"); await page.type(".detail-panel textarea", "Browser clients");
  await page.$$eval(".detail-panel button", (buttons) => buttons.find((button) => button.textContent === "Adicionar decisão")?.click());
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").design?.entities?.[0]?.decisions?.length === 1);

  await page.$$eval(".studio-header button", (buttons) => buttons.find((button) => button.textContent === "Conceitos")?.click());
  await page.waitForSelector(".glossary");
  assert.match(await page.$eval(".glossary", (element) => element.textContent ?? ""), /Boundary/);
  await page.click(".close-button");
  await page.$$eval(".studio-header button", (buttons) => buttons.find((button) => button.textContent === "Contexto do sistema")?.click());
  await page.waitForSelector(".context-summary");
  assert.match(await page.$eval(".context-summary", (element) => element.textContent ?? ""), /Não definida/);
  await page.click(".context-summary .primary-action");
  await page.type(".editor-form input", "TicketFlow API");
  await page.$$eval(".editor-form button", (buttons) => buttons.find((button) => button.textContent === "Salvar contexto")?.click());
  await page.click(".close-button");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelectorAll(".concept-node").length === 2);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}"));
  assert.equal(restored.design.systemContext.systemName, "TicketFlow API");
  assert.equal(restored.design.entities[0].decisions[0].title, "Use sessions");
  assert.equal(restored.design.relationships[0].kind, "reads-writes");
  assert.equal(restored.layout.nodes.length, 2);
  await page.click(".react-flow__node:first-child .concept-node");
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").design?.entities?.length === 1);
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").design?.entities?.length === 2);
  const undone = await page.evaluate(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}"));
  assert.equal(undone.design.entities[0].decisions[0].title, "Use sessions");
  assert.equal(undone.design.relationships.length, 1);
  await page.mouse.click(500, 300); await page.mouse.click(500, 300);
  await page.waitForSelector(".concept-name-input");
  await page.click(".concept-name-input");
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.type(".concept-name-input", "Auth Service"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").design?.entities?.[0]?.name === "Auth Service");
  const beforeDrag = await page.evaluate(() => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").layout.nodes[0].x as number);
  const firstNode = await page.$eval(".react-flow__node:first-child .concept-node", (element) => {
    const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.move(firstNode.x, firstNode.y); await page.mouse.down();
  await page.mouse.move(firstNode.x + 85, firstNode.y + 35, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction((x) => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").layout?.nodes?.[0]?.x !== x, {}, beforeDrag);
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await page.waitForFunction((x) => JSON.parse(localStorage.getItem("bunkercode:studio:v1") ?? "{}").layout?.nodes?.[0]?.x === x, {}, beforeDrag);
  assert.deepEqual(errors, []);
});

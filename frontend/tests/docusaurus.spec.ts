import { expect, test, type Page } from "@playwright/test";
async function portal(page: Page, initial: string) {
  let content = initial,
    sha = "file-1",
    head = "head-1";
  const writes: Record<string, unknown>[] = [];
  let settings = {
    version: 1,
    site: { title: "Python" },
    themeConfig: {
      navbar: { title: "Bestaand", items: [{ to: "/docs", label: "Lessen" }] },
    },
    tokens: {},
    docs: {},
  };
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let result: unknown = [];
      if (path === "/api/auth/me")
        result = { login: "teacher", csrf_token: "token" };
      if (path === "/api/sites")
        result = [
          {
            slug: "python",
            display_name: "Python",
            domain: "python.coderius.nl",
          },
        ];
      if (path.endsWith("/capabilities"))
        result = {
          framework: "docusaurus",
          managed_homepage: true,
          settings_runtime: true,
        };
      if (path.endsWith("/page")) {
        if (route.request().method() === "PUT") {
          const data = route.request().postDataJSON();
          writes.push(data);
          content = data.content;
          sha = `file-${writes.length + 1}`;
          result = { content_sha: sha, commit_sha: "commit" };
        } else
          result = {
            content,
            sha,
            path: url.searchParams.get("path"),
            ref: url.searchParams.get("ref"),
          };
      }
      if (path.endsWith("/settings")) {
        if (route.request().method() === "PUT") {
          const data = route.request().postDataJSON();
          writes.push(data);
          settings = data.settings;
          head = `head-${writes.length + 1}`;
          result = { settings, head_sha: head, commit_sha: head };
        } else result = { settings, head_sha: head };
      }
      if (path === "/api/branches" && route.request().method() === "POST")
        result = { name: route.request().postDataJSON().name, sha: head };
      await route.fulfill({ json: result });
    },
  );
  return writes;
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Opslaan…", exact: true }).click();
  await page
    .getByRole("button", { name: "Concept opslaan", exact: true })
    .click();
  await expect(page.getByText("Je concept is opgeslagen op")).toBeVisible();
  await page
    .getByRole("button", { name: "Verder bewerken", exact: true })
    .click();
}
test("homepage edits and section order survive repeated scoped saves", async ({
  page,
}) => {
  const writes = await portal(
    page,
    "import { Section } from '@coderius/shared/components/HomepageSections';\n\n<Section title=\"Eerste\">\n\nHallo.\n\n</Section>\n\n<InteractiveTool />\n",
  );
  await page.goto(
    "/sites/python/edit?scope=homepage&path=homepage.mdx&ref=lesson",
  );
  const first = page.locator(".homepage-section").first();
  await first.getByLabel("Titel", { exact: true }).fill("Welkom");
  await page
    .getByRole("button", { name: "Omlaag 1", exact: true })
    .first()
    .click();
  await save(page);
  expect(writes[0].scope).toBe("homepage");
  expect(String(writes[0].content).indexOf("<InteractiveTool")).toBeLessThan(
    String(writes[0].content).indexOf("<Section"),
  );
  await page
    .locator(".homepage-section")
    .getByLabel("Titel", { exact: true })
    .fill("Welkom terug");
  await save(page);
  expect(writes[1].sha).toBe("file-2");
  expect(writes[1].content).toContain("Welkom terug");
  await page.reload();
  await expect(
    page.locator(".homepage-section").getByLabel("Titel", { exact: true }),
  ).toHaveValue("Welkom terug");
});
test("theme saves retain unrelated configuration and use updated head", async ({
  page,
}) => {
  const writes = await portal(page, "");
  await page.goto("/sites/python/settings?ref=lesson");
  await page.getByLabel("Sitetitel", { exact: true }).fill("Nieuwe cursus");
  await save(page);
  expect(writes[0].expected_head).toBe("head-1");
  expect((writes[0].settings as { themeConfig: unknown }).themeConfig).toEqual({
    navbar: { title: "Bestaand", items: [{ to: "/docs", label: "Lessen" }] },
  });
  await page.getByLabel("Sitetitel", { exact: true }).fill("Nieuwe cursus 2");
  await save(page);
  expect(writes[1].expected_head).toBe("head-2");
  let releaseRefresh!:()=>void;
  const refreshGate=new Promise<void>(resolve=>{releaseRefresh=resolve});
  await page.route('**/api/sites/python/settings?ref=lesson',async route=>{await refreshGate;await route.fallback()});
  await page.getByText('Dashboard', {exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sites',exact:true})).toBeVisible();
  await page.evaluate(()=>{history.pushState(null,'','/sites/python/settings?ref=lesson');window.dispatchEvent(new PopStateEvent('popstate'));});
  try{await expect(page.getByLabel('Sitetitel',{exact:true})).toHaveValue('Nieuwe cursus 2',{timeout:2000});}finally{releaseRefresh();}
  await page.getByLabel('Sitetitel',{exact:true}).fill('Na terugkeer');
  await save(page);expect(writes[2].expected_head).toBe('head-3');

});
test("standalone page saves use pages scope", async ({ page }) => {
  const writes = await portal(page, "# Contact\n\nWelkom.");
  await page.goto("/sites/python/edit?scope=pages&path=contact.md&ref=lesson");
  await page.getByLabel("Titel", { exact: true }).fill("Contact opnemen");
  await save(page);
  expect(writes[0].scope).toBe("pages");
});
test("category form saves metadata and retains custom properties", async ({
  page,
}) => {
  const writes = await portal(
    page,
    '{"label":"Basis","customProps":{"icon":"book"}}',
  );
  await page.goto(
    "/sites/python/metadata?scope=metadata&path=basis%2F_category_.json&ref=lesson",
  );
  await page.getByLabel("Categorienaam").fill("Beginnen");
  await save(page);
  expect(writes[0].scope).toBe("metadata");
  expect(JSON.parse(String(writes[0].content))).toEqual({
    label: "Beginnen",
    customProps: { icon: "book" },
  });
});

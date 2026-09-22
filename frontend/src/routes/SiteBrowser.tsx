import {
  Alert,
  Button,
  Code,
  Grid,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconPencil, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { usePage, useSites, useTree } from "../api/hooks";
import { contentScope } from "../api/types";
import { NewMetadataModal } from "../components/NewMetadataModal";
import { NewPageModal } from "../components/NewPageModal";
import { PageTree } from "../components/PageTree";

export function SiteBrowser() {
  const { site = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ref, setRef] = useState(searchParams.get("ref") ?? "main");
  const [newPageOpen, setNewPageOpen] = useState(false);

  const scope = contentScope(searchParams.get("scope"));
  const selectedPath = searchParams.get("path");
  const { data: sites } = useSites();
  const {
    data: tree,
    isLoading: treeLoading,
    error: treeError,
  } = useTree(site, ref, scope);
  const { data: page, isLoading: pageLoading } = usePage(
    site,
    selectedPath,
    ref,
    scope,
  );

  const siteInfo = sites?.find((s) => s.slug === site);

  return (
    <>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>{siteInfo?.display_name ?? site}</Title>
          <Text size="sm" c="dimmed">
            {siteInfo?.domain}
          </Text>
        </div>
        <Group align="flex-end" gap="xs">
          <TextInput
            label="Branch"
            value={ref}
            onChange={(e) => setRef(e.currentTarget.value)}
            w={220}
            size="xs"
          />
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            disabled={treeLoading || !!treeError || !tree}
            onClick={() => setNewPageOpen(true)}
          >
            Nieuwe pagina
          </Button>
        </Group>
      </Group>

      {scope === "metadata" ? (
        <NewMetadataModal
          opened={newPageOpen}
          onClose={() => setNewPageOpen(false)}
          site={site}
          branch={ref}
          tree={tree ?? []}
        />
      ) : (
        <NewPageModal
          opened={newPageOpen}
          onClose={() => setNewPageOpen(false)}
          site={site}
          tree={tree ?? []}
          branch={ref}
          scope={scope}
        />
      )}

      <Group mb="md">
        <SegmentedControl
          aria-label="Inhoudstype"
          value={scope}
          onChange={(next) => setSearchParams({ ref, scope: next })}
          data={[
            { value: "docs", label: "Lessen" },
            { value: "pages", label: "Pagina's" },
            { value: "metadata", label: "Categorieën en tags" },
          ]}
        />
        {site !== "home" && (
          <>
            <Button
              variant="light"
              onClick={() =>
                navigate(
                  `/sites/${site}/edit?${new URLSearchParams({ scope: "homepage", path: "homepage.mdx", ref })}`,
                )
              }
            >
              Homepage
            </Button>
            <Button
              variant="light"
              onClick={() =>
                navigate(
                  `/sites/${site}/settings?${new URLSearchParams({ ref })}`,
                )
              }
            >
              Vormgeving
            </Button>
          </>
        )}
      </Group>
      {treeError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md">
          Kon de bestandsboom niet laden: {String(treeError)}
        </Alert>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="xs">
            <ScrollArea h="70vh">
              {treeLoading ? (
                <Loader size="sm" m="md" />
              ) : (
                <PageTree
                  items={tree ?? []}
                  selected={selectedPath}
                  onSelect={(path) => setSearchParams({ path, ref, scope })}
                  metadata={scope === "metadata"}
                />
              )}
            </ScrollArea>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder p="md">
            {!selectedPath && <Text c="dimmed">Kies links een pagina.</Text>}
            {pageLoading && <Loader size="sm" />}
            {page && (
              <>
                <Group justify="space-between" mb="sm">
                  <Text fw={600}>{page.path}</Text>
                  <Button
                    size="xs"
                    leftSection={<IconPencil size={14} />}
                    onClick={() =>
                      navigate(
                        `/sites/${site}/${scope === "metadata" ? "metadata" : "edit"}?path=${encodeURIComponent(page.path)}&ref=${encodeURIComponent(ref)}&scope=${scope}`,
                      )
                    }
                  >
                    Bewerken
                  </Button>
                </Group>
                <ScrollArea h="62vh">
                  <Code block>{page.content}</Code>
                </ScrollArea>
              </>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </>
  );
}

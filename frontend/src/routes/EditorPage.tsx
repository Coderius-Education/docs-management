import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { IconChevronDown, IconDeviceFloppy, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { usePage } from '../api/hooks';
import { FrontmatterForm } from '../components/editor/FrontmatterForm';
import { RawEditor, type ReactCodeMirrorRef } from '../components/editor/RawEditor';
import { siteSnippets } from '../components/editor/snippets';
import { WysiwygEditor } from '../components/editor/WysiwygEditor';
import { SaveModal } from '../components/SaveModal';
import {
  hasMdxConstructs,
  joinFrontmatter,
  type SplitDoc,
  splitFrontmatter,
} from '../lib/frontmatter';
import { MdxPreview } from '../lib/mdx-preview/MdxPreview';

export function EditorPage() {
  const { site = '' } = useParams();
  const [searchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const ref = searchParams.get('ref') ?? 'main';
  const isNew = searchParams.get('nieuw') === '1';
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  const { data: page, isLoading } = usePage(site, isNew ? null : path, ref);

  // Bron van waarheid: frontmatter-object + body-tekst (+ origineel voor nul-diff).
  const [splitDoc, setSplitDoc] = useState<SplitDoc | null>(null);
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown>>({});
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'wysiwyg' | 'raw'>('raw');
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (isNew && !loaded) {
      const template = sessionStorage.getItem(`nieuw:${site}:${path}`) ?? '';
      const split = splitFrontmatter(template);
      setSplitDoc(split);
      setFrontmatter(split.frontmatter);
      setBody(split.body);
      setLoaded(true);
      setMode('wysiwyg');
    } else if (page && !loaded) {
      const split = splitFrontmatter(page.content);
      setSplitDoc(split);
      setFrontmatter(split.frontmatter);
      setBody(split.body);
      setLoaded(true);
      setMode(hasMdxConstructs(split.body) ? 'raw' : 'wysiwyg');
    }
  }, [page, isNew, loaded, site, path]);

  const mdxLocked = useMemo(() => hasMdxConstructs(body), [body]);
  const newContent = useMemo(
    () => (splitDoc ? joinFrontmatter(splitDoc, frontmatter, body) : body),
    [splitDoc, frontmatter, body],
  );
  const originalContent = page?.content ?? '';
  const dirty = isNew || newContent !== originalContent;

  function insertSnippet(content: string) {
    if (mode === 'raw' && cmRef.current?.view) {
      const view = cmRef.current.view;
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: content } });
      // body-state volgt via onChange van CodeMirror
    } else {
      setBody((prev) => `${prev.replace(/\n+$/, '')}\n\n${content}`);
    }
  }

  if (isLoading) return <Loader />;

  return (
    <Stack gap="xs" h="calc(100vh - 92px)">
      <Group justify="space-between">
        <Group gap="xs">
          <Text fw={600}>{path}</Text>
          <Badge variant="light">{ref}</Badge>
          {isNew && <Badge color="green">nieuw</Badge>}
        </Group>
        <Group gap="xs">
          <Menu>
            <Menu.Target>
              <Button variant="default" size="xs" rightSection={<IconChevronDown size={14} />}>
                Snippet invoegen
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {siteSnippets(site).map((snippet) => (
                <Menu.Item key={snippet.label} onClick={() => insertSnippet(snippet.content)}>
                  {snippet.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <SegmentedControl
            size="xs"
            value={mode}
            onChange={(v) => setMode(v as 'wysiwyg' | 'raw')}
            data={[
              { label: 'Visueel', value: 'wysiwyg', disabled: mdxLocked },
              { label: 'MDX', value: 'raw' },
            ]}
          />
          <Button
            size="xs"
            leftSection={<IconDeviceFloppy size={14} />}
            disabled={!dirty}
            onClick={() => setSaveOpen(true)}
          >
            Opslaan…
          </Button>
        </Group>
      </Group>

      {mdxLocked && mode === 'raw' && (
        <Alert icon={<IconInfoCircle size={16} />} color="blue" p="xs">
          Deze pagina bevat MDX (imports of componenten); de visuele editor is daarom
          uitgeschakeld. Je bewerkt de bron rechtstreeks — rechts zie je de preview.
        </Alert>
      )}

      <Paper withBorder p="xs">
        <FrontmatterForm value={frontmatter} onChange={setFrontmatter} />
      </Paper>

      <Group grow align="stretch" style={{ flex: 1, minHeight: 0 }}>
        <Paper withBorder style={{ overflow: 'hidden', height: '100%' }}>
          {mode === 'raw' ? (
            <ScrollArea h="100%">
              <RawEditor ref={cmRef} value={body} onChange={setBody} />
            </ScrollArea>
          ) : (
            <WysiwygEditor initialValue={body} onChange={setBody} />
          )}
        </Paper>
        <Paper withBorder p="md" style={{ overflow: 'hidden', height: '100%' }}>
          <ScrollArea h="100%">
            <MdxPreview body={body} />
          </ScrollArea>
        </Paper>
      </Group>

      <SaveModal
        opened={saveOpen}
        onClose={() => setSaveOpen(false)}
        site={site}
        path={path}
        originalContent={originalContent}
        newContent={newContent}
        sha={isNew ? null : (page?.sha ?? null)}
        currentBranch={ref}
      />
    </Stack>
  );
}

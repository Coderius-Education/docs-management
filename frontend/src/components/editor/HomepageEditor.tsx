import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconGripVertical,
  IconMoon,
  IconPhoto,
  IconPlus,
  IconSettings,
  IconSun,
  IconTrash,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCode,
  IconPalette,
  IconAdjustments,
  IconX,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import {
  createElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  addSection,
  insertSectionInParent,
  modelForNode,
  sectionBindings,
  sectionLabels,
  homepageChildren as childrenOf,
} from '../../lib/authoring/homepage';
import {
  parseTree,
  range,
  replaceRange,
  importsFrom,
  textContent,
  type LessonNode,
} from '../../lib/authoring/syntax';
import { attributes, insertComponent } from '../../lib/authoring/components';
import { insertTabs } from '../../lib/authoring/content';
import { resolveAsset } from '../../lib/authoring/assets';
import { type SiteSettings } from '../../lib/authoring/settings';
import { MdxPreview } from '../../lib/mdx-preview/MdxPreview';
import {
  CourseCanvas,
  SectionVisual,
  toolLabel,
  type CanvasRegion,
} from './CourseCanvas';
import { LessonEditor } from './LessonEditor';
import { RawEditor } from './RawEditor';
import './HomepageEditor.css';

export type StudioPanel =
  'section' | 'navbar' | 'footer' | 'announcement' | 'style' | 'site';
export interface PanelContext {
  colorMode: 'light' | 'dark';
  setColorMode: (mode: 'light' | 'dark') => void;
  /** Index of the menu link clicked on the page. */
  navItem?: number;
  open: (panel: StudioPanel) => void;
}
type Props = React.ComponentProps<typeof LessonEditor> & {
  /** Course appearance as the page shows it: inherited values plus the course's own. */
  settings?: SiteSettings;
  title?: string;
  tagline?: string;
  /** Content of the panels for everything around the page content. */
  renderPanel?: (
    panel: Exclude<StudioPanel, 'section'>,
    context: PanelContext,
  ) => ReactNode;
  initialPanel?: StudioPanel | null;
  /** Extra status next to the canvas toolbar, e.g. where inherited values come from. */
  status?: ReactNode;
};
const panelTitles: Record<Exclude<StudioPanel, 'section'>, string> = {
  navbar: 'Koptekst',
  footer: 'Voettekst',
  announcement: 'Mededeling',
  style: 'Stijl',
  site: 'Site',
};
function nodeAt(root: LessonNode, path: string) {
  return path
    .split('.')
    .reduce<LessonNode | undefined>(
      (node, index) => node && childrenOf(node)[Number(index)],
      root,
    );
}
function InlineText({
  value,
  placeholder = '',
  label,
  as = 'span',
  onChange,
  className = '',
}: {
  value: string;
  placeholder?: string;
  label: string;
  as?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (ref.current && ref.current.textContent !== value)
      ref.current.textContent = value;
  }, [value]);
  return createElement(as, {
    ref,
    role: 'textbox',
    'aria-label': label,
    contentEditable: 'plaintext-only',
    suppressContentEditableWarning: true,
    'data-placeholder': placeholder,
    className: `homepage-inline-text ${className}`,
    onInput: (event: React.FormEvent<HTMLElement>) =>
      onChange(event.currentTarget.textContent ?? ''),
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  });
}
export function HomepageEditor(props: Props) {
  const {
    value,
    onChange,
    assetContext = {},
    site,
    settings,
    renderPanel,
  } = props;
  const latest = useRef(value);
  latest.current = value;
  const [selected, setSelected] = useState('0');
  const [panel, setPanel] = useState<StudioPanel | null>(
      props.initialPanel ?? null,
    ),
    [source, setSource] = useState(false),
    [navItem, setNavItem] = useState<number>();
  const narrow = useMediaQuery('(max-width: 900px)');
  const setInspector = (open: boolean) => setPanel(open ? 'section' : null);
  const [gallery, setGallery] = useState<{ parent?: string } | null>(null);
  const [error, setError] = useState(''),
    [uploading, setUploading] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop'),
    [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
  const [preview, setPreview] = useState(false);
  const undo = useRef<string[]>([]),
    redo = useRef<string[]>([]);
  const [, refreshHistory] = useState(0);
  const dragSource = useRef<string | null>(null);
  const title = props.title ?? site ?? 'Cursus';
  const tagline = props.tagline ?? '';
  const parsed = useMemo(() => {
    try {
      return { tree: parseTree(value), bindings: sectionBindings(value) };
    } catch (e) {
      return { error: String(e) };
    }
  }, [value]);
  const current = parsed.tree ? nodeAt(parsed.tree, selected) : undefined;
  const model =
    current && parsed.bindings
      ? modelForNode(current, parsed.bindings, value)
      : null;
  const label = model
    ? sectionLabels[model.name]
    : current?.name
      ? toolLabel(current.name)
      : 'Tekst';
  const index = Number(selected.split('.').at(-1));
  const parentPath = selected.includes('.')
    ? selected.slice(0, selected.lastIndexOf('.'))
    : '';
  const parent = parsed.tree
    ? parentPath
      ? nodeAt(parsed.tree, parentPath)
      : parsed.tree
    : undefined;
  const siblings = parent ? childrenOf(parent) : [];
  function change(next: string) {
    if (next === latest.current) return;
    undo.current.push(latest.current);
    if (undo.current.length > 80) undo.current.shift();
    redo.current = [];
    latest.current = next;
    onChange(next);
    refreshHistory((v) => v + 1);
  }
  function timeTravel(direction: 'undo' | 'redo') {
    const from = direction === 'undo' ? undo.current : redo.current,
      to = direction === 'undo' ? redo.current : undo.current;
    const next = from.pop();
    if (next === undefined) return;
    to.push(latest.current);
    latest.current = next;
    onChange(next);
    refreshHistory((v) => v + 1);
    if (panel === 'section') setInspector(false);
  }
  function updateProp(
    node: LessonNode,
    key: string,
    val: string | number | undefined,
  ) {
    if (!parsed.bindings) return;
    const m = modelForNode(node, parsed.bindings, value);
    if (!m || m.locked.includes('*') || m.locked.includes(key)) return;
    const attr = attributes(node).find((a) => a.name === key);
    const text = val === undefined ? '' : `${key}={${JSON.stringify(val)}}`;
    if (attr) change(replaceRange(value, range(attr), text));
    else if (val !== undefined) {
      const at = range(node).from + 1 + node.name!.length;
      change(replaceRange(value, { from: at, to: at }, ` ${text}`));
    }
  }
  function move(direction: -1 | 1) {
    const other = siblings[index + direction];
    if (!current || !other) return;
    const a = range(direction < 0 ? other : current),
      b = range(direction < 0 ? current : other);
    change(
      replaceRange(
        value,
        { from: a.from, to: b.to },
        value.slice(b.from, b.to) +
          value.slice(a.to, b.from) +
          value.slice(a.from, a.to),
      ),
    );
    setSelected(
      [...selected.split('.').slice(0, -1), String(index + direction)].join(
        '.',
      ),
    );
  }
  function drop(target: string) {
    const from = dragSource.current;
    dragSource.current = null;
    if (!parsed.tree || !from || from === target) return;
    const aParts = from.split('.');
    target = target.split('.').slice(0, aParts.length).join('.');
    if (from === target) return;
    const bParts = target.split('.');
    if (aParts.slice(0, -1).join('.') !== bParts.slice(0, -1).join('.')) return;
    const sourceNode = nodeAt(parsed.tree, from),
      targetNode = nodeAt(parsed.tree, target);
    if (!sourceNode || !targetNode) return;
    const a = range(sourceNode),
      b = range(targetNode),
      raw = value.slice(a.from, a.to);
    const next =
      a.from < b.from
        ? replaceRange(
            value,
            { from: a.from, to: b.to },
            value.slice(a.to, b.to) + `\n\n${raw}`,
          )
        : replaceRange(
            value,
            { from: b.from, to: a.to },
            `${raw}\n\n` + value.slice(b.from, a.from),
          );
    change(next);
    setSelected(target);
  }
  function add(name: string) {
    if (!parsed.tree) return;
    const parentNode = gallery?.parent
      ? nodeAt(parsed.tree, gallery.parent)
      : undefined;
    const next = parentNode
      ? insertSectionInParent(value, parentNode, name)
      : addSection(value, name);
    const parentAddress = gallery?.parent;
    change(next);
    setGallery(null);
    const nextTree = parseTree(next),
      nextParent = parentAddress ? nodeAt(nextTree, parentAddress) : nextTree;
    setSelected(
      [
        ...(parentAddress ? parentAddress.split('.') : []),
        String(childrenOf(nextParent!).length - 1),
      ].join('.'),
    );
  }
  async function upload(file: File) {
    if (!props.onUploadImage || !current) return;
    const snapshot = value;
    setUploading(true);
    setError('');
    try {
      const url = await props.onUploadImage(file);
      if (latest.current === snapshot) updateProp(current, 'src', url);
      else
        setError(
          `Afbeelding geüpload. De pagina is gewijzigd; gebruik deze link: ${url}`,
        );
    } catch (e) {
      setError(`Uploaden mislukt: ${String(e)}`);
    } finally {
      setUploading(false);
    }
  }
  const imports = parsed.tree
    ? (parsed.tree.children ?? [])
        .filter((n) => n.type === 'mdxjsEsm')
        .map((n) => value.slice(range(n).from, range(n).to))
        .join('\n')
    : '';
  function render(node: LessonNode, path: string): ReactNode {
    const r = range(node),
      raw = value.slice(r.from, r.to),
      m = modelForNode(node, parsed.bindings!, value),
      active = selected === path;
    const slot = (key: string, as: string, placeholder = '') =>
      m?.locked.includes(key) || m?.locked.includes('*') ? undefined : (
        <InlineText
          key={key}
          value={typeof m?.props[key] === 'string' ? String(m.props[key]) : ''}
          placeholder={placeholder}
          label={key === 'title' ? 'Titel' : 'Ondertitel'}
          as={as}
          className={m?.name === 'Hero' ? '' : 'homepage-optional-field'}
          onChange={(v) => updateProp(node, key, v || undefined)}
        />
      );
    let content: ReactNode;
    if (m) {
      const image = resolveAsset(String(m.props.src ?? ''), assetContext);
      const canImage = !m.locked.includes('*') && !m.locked.includes('src');
      const picture =
        m.name === 'Picture' ? (
          <button
            type="button"
            className="homepage-image-select"
            aria-label="Afbeelding vervangen"
            onClick={() => {
              setSelected(path);
              setInspector(true);
            }}
            disabled={!canImage}
          >
            {image ? (
              <img src={image} alt={String(m.props.alt ?? '')} />
            ) : (
              <span className="course-image-empty">
                <IconPhoto />
                Kies een afbeelding
              </span>
            )}
            <span className="homepage-image-action">
              <IconPhoto size={16} /> Afbeelding vervangen
            </span>
          </button>
        ) : undefined;
      const plainButton =
        m.name === 'Button' &&
        !!m.bodyRange &&
        childrenOf(node).every(
          (n) =>
            n.type === 'text' ||
            (n.type === 'paragraph' &&
              n.children?.every((c) => c.type === 'text')),
        );
      content = (
        <SectionVisual
          name={m.name}
          properties={m.props}
          title={title}
          tagline={tagline}
          assetContext={assetContext}
          titleSlot={
            ['Hero', 'Section', 'Card'].includes(m.name)
              ? slot(
                  'title',
                  m.name === 'Hero' ? 'h1' : 'h2',
                  m.name === 'Hero' ? title : 'Klik om een titel toe te voegen',
                )
              : undefined
          }
          subtitleSlot={
            ['Hero', 'Section'].includes(m.name)
              ? slot(
                  m.name === 'Hero' ? 'tagline' : 'subtitle',
                  'p',
                  m.name === 'Hero' ? tagline : 'Ondertitel toevoegen',
                )
              : undefined
          }
          pictureSlot={picture}
        >
          {plainButton ? (
            <InlineText
              value={textContent(node)}
              label="Knoptekst"
              onChange={(next) =>
                change(
                  replaceRange(
                    value,
                    m.bodyRange!,
                    next
                      .replace(/[\\*_[\]<>`{}]/g, '\\$&')
                      .replace(/\r?\n/g, ' '),
                  ),
                )
              }
            />
          ) : (
            childrenOf(node).map((n, i) => render(n, `${path}.${i}`))
          )}
          {!node.children?.length &&
            !['Picture', 'Divider'].includes(m.name) && (
              <button
                className="homepage-empty-content"
                type="button"
                onClick={() => setGallery({ parent: path })}
              >
                <IconPlus size={16} /> Inhoud toevoegen
              </button>
            )}
        </SectionVisual>
      );
    } else if (node.name && !['details', 'summary'].includes(node.name)) {
      content = (
        <div className="course-tool">
          <span className="course-tool-symbol" aria-hidden="true">
            ◇
          </span>
          <strong>{toolLabel(node.name)}</strong>
          <span>
            Dit onderdeel blijft werken in de cursus. Je kunt het hier
            verplaatsen.
          </span>
          {assetContext.previewOrigin && (
            <a
              href={assetContext.previewOrigin}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open cursusvoorbeeld
            </a>
          )}
        </div>
      );
    } else {
      content = active ? (
        <div className="homepage-markdown-edit">
          <LessonEditor
            {...props}
            nested
            inheritedImports={importsFrom(parsed.tree!)}
            onInsertComponent={(name, offset) =>
              change(insertComponent(value, site, name, r.from + offset))
            }
            onInsertTabs={(offset) =>
              change(insertTabs(value, r.from + offset))
            }
            value={raw}
            onChange={(next) => change(replaceRange(value, r, next))}
          />
        </div>
      ) : (
        <div className="course-markdown homepage-text-preview">
          <MdxPreview
            embedded
            body={`${imports}\n\n${raw}`}
            {...assetContext}
          />
        </div>
      );
    }
    return (
      <div
        key={path}
        className={`homepage-section${active ? ' is-selected' : ''}${m?.name === 'Button' ? ' is-button' : ''}`}
        data-section-path={path}
        tabIndex={0}
        role="group"
        aria-label={`${m ? sectionLabels[m.name] : node.name ? toolLabel(node.name) : 'Tekst'} ${path
          .split('.')
          .map((n) => Number(n) + 1)
          .join('.')}`}
        onClick={(e) => {
          e.stopPropagation();
          setSelected(path);
          if (
            panel &&
            panel !== 'section' &&
            panel !== 'style' &&
            panel !== 'site'
          )
            setPanel('section');
        }}
        onFocusCapture={(e) => {
          if (
            (e.target as HTMLElement).closest('.homepage-section') ===
            e.currentTarget
          )
            setSelected(path);
        }}
        onDragOver={(e) => {
          if (dragSource.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          drop(path);
        }}
      >
        {content}
        <span className="homepage-section-hint" aria-hidden="true">
          {m ? sectionLabels[m.name] : 'Klik om te bewerken'}
        </span>
      </div>
    );
  }
  function selectRegion(region: CanvasRegion) {
    if (
      region === 'navbar' ||
      region === 'footer' ||
      region === 'announcement'
    ) {
      setNavItem(undefined);
      setPanel(region);
    }
  }
  const panelContext: PanelContext = {
    colorMode,
    setColorMode,
    navItem,
    open: setPanel,
  };
  const panelTitle =
    panel === 'section'
      ? `${label} aanpassen`
      : panel
        ? panelTitles[panel]
        : '';
  const panelContent =
    panel === 'section'
      ? inspectorContent()
      : panel && renderPanel
        ? renderPanel(panel, panelContext)
        : null;
  function inspectorContent() {
    return (
      <>
        {current && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Tekst wijzig je rechtstreeks op de pagina. Hier pas je de indeling
              en links aan.
            </Text>
            {model?.name === 'Picture' && (
              <>
                <FileButton
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(file) => {
                    if (file) void upload(file);
                  }}
                >
                  {(p) => (
                    <Button
                      {...p}
                      disabled={
                        !props.onUploadImage ||
                        model.locked.includes('*') ||
                        model.locked.includes('src')
                      }
                      loading={uploading}
                      leftSection={<IconPhoto size={18} />}
                    >
                      Afbeelding uploaden
                    </Button>
                  )}
                </FileButton>
                {['src', 'alt', 'caption'].map((key) => (
                  <TextInput
                    key={key}
                    label={
                      {
                        src: 'Afbeeldingslink',
                        alt: 'Beschrijving voor schermlezers',
                        caption: 'Bijschrift',
                      }[key]
                    }
                    value={String(model.props[key] ?? '')}
                    disabled={
                      model.locked.includes(key) || model.locked.includes('*')
                    }
                    onChange={(e) =>
                      updateProp(
                        current,
                        key,
                        e.currentTarget.value || undefined,
                      )
                    }
                  />
                ))}
              </>
            )}
            {model && ['Card', 'Button'].includes(model.name) && (
              <TextInput
                label="Waar gaat deze link naartoe?"
                placeholder="Bijvoorbeeld /docs/intro"
                value={String(model.props.href ?? '')}
                disabled={
                  model.locked.includes('href') || model.locked.includes('*')
                }
                onChange={(e) =>
                  updateProp(
                    current,
                    'href',
                    e.currentTarget.value || undefined,
                  )
                }
              />
            )}
            {model?.name === 'Card' && (
              <TextInput
                label="Extra informatie"
                value={String(model.props.info ?? '')}
                disabled={
                  model.locked.includes('info') || model.locked.includes('*')
                }
                onChange={(e) =>
                  updateProp(
                    current,
                    'info',
                    e.currentTarget.value || undefined,
                  )
                }
              />
            )}
            {model?.name === 'Columns' && (
              <NumberInput
                label="Aantal kolommen"
                min={1}
                max={4}
                allowDecimal={false}
                value={Number(model.props.count) || 3}
                disabled={
                  model.locked.includes('count') || model.locked.includes('*')
                }
                onChange={(v) => updateProp(current, 'count', Number(v))}
              />
            )}
            {model?.name === 'Hero' && (
              <Select
                label="Indeling"
                placeholder="Standaard"
                clearable
                data={[
                  { value: 'default', label: 'Grote introductie' },
                  { value: 'compact', label: 'Compact' },
                  { value: 'plain', label: 'Rustig, zonder kleurvlak' },
                ]}
                value={String(model.props.variant ?? 'default')}
                disabled={
                  model.locked.includes('variant') || model.locked.includes('*')
                }
                onChange={(v) => updateProp(current, 'variant', v ?? undefined)}
              />
            )}
            {model?.name === 'Button' && (
              <>
                <Select
                  label="Knopstijl"
                  data={[
                    { value: 'primary', label: 'Cursuskleur' },
                    { value: 'secondary', label: 'Licht' },
                  ]}
                  value={String(model.props.variant ?? 'secondary')}
                  disabled={
                    model.locked.includes('variant') ||
                    model.locked.includes('*')
                  }
                  onChange={(v) =>
                    updateProp(current, 'variant', v ?? undefined)
                  }
                />
                <Select
                  label="Grootte"
                  data={[
                    { value: 'sm', label: 'Klein' },
                    { value: 'lg', label: 'Groot' },
                  ]}
                  value={String(model.props.size ?? 'lg')}
                  disabled={
                    model.locked.includes('size') || model.locked.includes('*')
                  }
                  onChange={(v) => updateProp(current, 'size', v ?? undefined)}
                />
              </>
            )}
            {model &&
              model.name !== 'Button' &&
              Object.entries({
                width: {
                  full: 'Hele pagina',
                  wide: 'Breed',
                  normal: 'Normaal',
                  narrow: 'Smal',
                },
                spacing: {
                  none: 'Geen',
                  small: 'Weinig',
                  normal: 'Normaal',
                  large: 'Veel',
                },
                align: { left: 'Links', center: 'Midden', right: 'Rechts' },
                background: {
                  transparent: 'Geen kleur',
                  muted: 'Subtiel',
                  primary: 'Cursuskleur',
                },
              }).map(([key, options]) => (
                <Select
                  key={key}
                  label={
                    (
                      {
                        width: 'Breedte',
                        spacing: 'Ruimte rondom',
                        align: 'Uitlijning',
                        background: 'Achtergrond',
                      } as Record<string, string>
                    )[key]
                  }
                  data={Object.entries(options).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  value={
                    typeof model.props[key] === 'string'
                      ? String(model.props[key])
                      : null
                  }
                  placeholder="Standaard van de cursus"
                  clearable
                  disabled={
                    model.locked.includes(key) || model.locked.includes('*')
                  }
                  onChange={(v) => updateProp(current, key, v ?? undefined)}
                />
              ))}
            {model &&
              !['Button', 'Picture', 'Divider'].includes(model.name) && (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => {
                    setInspector(false);
                    setGallery({ parent: selected });
                  }}
                >
                  Onderdeel toevoegen
                </Button>
              )}
            {!!model?.locked.length && (
              <Alert>
                Dit onderdeel gebruikt dynamische waarden. Die blijven behouden;
                je kunt ze via de broncode aanpassen.
              </Alert>
            )}
            <Button
              variant="subtle"
              leftSection={<IconCode size={16} />}
              onClick={() => setSource((v) => !v)}
            >
              Broncode van dit onderdeel
            </Button>
            {source && (
              <RawEditor
                height="260px"
                value={value.slice(range(current).from, range(current).to)}
                onChange={(next) =>
                  change(replaceRange(value, range(current), next))
                }
              />
            )}
          </Stack>
        )}
      </>
    );
  }
  if (!parsed.tree || !parsed.bindings)
    return <Alert color="orange">{parsed.error}</Alert>;
  return (
    <Stack gap="sm" className="homepage-studio">
      <div className="homepage-studio-topbar">
        <div>
          <Text fw={600}>Maak de pagina van je cursus</Text>
          <Text size="sm" c="dimmed">
            Klik op tekst om te schrijven. Klik op een onderdeel, de koptekst of
            de voettekst om het aan te passen.
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label="Ongedaan maken">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Ongedaan maken"
              disabled={!undo.current.length || uploading}
              onClick={() => timeTravel('undo')}
            >
              <IconArrowBackUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Opnieuw uitvoeren">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Opnieuw uitvoeren"
              disabled={!redo.current.length || uploading}
              onClick={() => timeTravel('redo')}
            >
              <IconArrowForwardUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Button
            variant={preview ? 'filled' : 'default'}
            onClick={() => setPreview((v) => !v)}
            leftSection={<IconCheck size={16} />}
          >
            {preview ? 'Verder bewerken' : 'Bekijken'}
          </Button>
          {renderPanel && (
            <>
              <Button
                variant={panel === 'style' ? 'light' : 'default'}
                leftSection={<IconPalette size={16} />}
                onClick={() => setPanel(panel === 'style' ? null : 'style')}
              >
                Stijl
              </Button>
              <Button
                variant={panel === 'site' ? 'light' : 'default'}
                leftSection={<IconAdjustments size={16} />}
                onClick={() => setPanel(panel === 'site' ? null : 'site')}
              >
                Site
              </Button>
            </>
          )}
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setGallery({})}
          >
            Sectie toevoegen
          </Button>
        </Group>
      </div>
      {error && (
        <Alert color="red" withCloseButton onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <div className="homepage-canvas-toolbar">
        <Group gap={4}>
          <ActionIcon
            variant={device === 'desktop' ? 'light' : 'subtle'}
            aria-label="Desktopvoorbeeld"
            onClick={() => setDevice('desktop')}
          >
            <IconDeviceDesktop size={19} />
          </ActionIcon>
          <ActionIcon
            variant={device === 'mobile' ? 'light' : 'subtle'}
            aria-label="Mobielvoorbeeld"
            onClick={() => setDevice('mobile')}
          >
            <IconDeviceMobile size={19} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            aria-label={
              colorMode === 'light' ? 'Donker voorbeeld' : 'Licht voorbeeld'
            }
            onClick={() =>
              setColorMode((v) => (v === 'light' ? 'dark' : 'light'))
            }
          >
            {colorMode === 'light' ? (
              <IconMoon size={18} />
            ) : (
              <IconSun size={18} />
            )}
          </ActionIcon>
        </Group>
        <Group gap="xs" className="homepage-canvas-status">
          {props.status}
          <Text size="xs" c="dimmed">
            {preview
              ? 'Voorbeeld van je wijzigingen'
              : renderPanel
                ? 'Klik op de koptekst of voettekst om die aan te passen'
                : 'Bewerken op de pagina'}
          </Text>
        </Group>
      </div>
      {!preview && current && (
        <div
          className="homepage-selection-toolbar"
          role="toolbar"
          aria-label="Geselecteerd onderdeel"
        >
          <span
            draggable
            onDragStart={(e) => {
              dragSource.current = selected;
              e.dataTransfer.setData('text/plain', selected);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              dragSource.current = null;
            }}
            className="homepage-drag-handle"
            title="Sleep dit onderdeel naar een andere plek"
          >
            <IconGripVertical size={17} />
          </span>
          <Text size="sm" fw={600}>
            {label}
          </Text>
          {parentPath && (
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => setSelected(parentPath)}
            >
              Bovenliggend
            </Button>
          )}
          <div className="homepage-selection-actions">
            <ActionIcon
              variant="subtle"
              aria-label={`Omhoog ${index + 1}`}
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              <IconArrowUp size={17} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label={`Omlaag ${index + 1}`}
              disabled={index === siblings.length - 1}
              onClick={() => move(1)}
            >
              <IconArrowDown size={17} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label="Dupliceren"
              onClick={() => {
                const r = range(current);
                change(
                  replaceRange(
                    value,
                    { from: r.to, to: r.to },
                    `\n\n${value.slice(r.from, r.to)}`,
                  ),
                );
              }}
            >
              <IconCopy size={17} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Verwijderen"
              onClick={() => {
                change(replaceRange(value, range(current), ''));
                setSelected(parentPath || '0');
              }}
            >
              <IconTrash size={17} />
            </ActionIcon>
            <Button
              size="compact-sm"
              variant="light"
              leftSection={<IconSettings size={16} />}
              onClick={() => {
                setSource(false);
                setInspector(true);
              }}
            >
              Aanpassen
            </Button>
          </div>
        </div>
      )}
      <div className={`homepage-stage${panel && !narrow ? ' has-panel' : ''}`}>
        <div className="homepage-canvas-surround">
          <CourseCanvas
            body={value}
            assetContext={assetContext}
            settings={settings}
            title={title}
            tagline={tagline}
            device={device}
            colorMode={colorMode}
            selectedRegion={
              panel && ['navbar', 'footer', 'announcement'].includes(panel)
                ? (panel as CanvasRegion)
                : undefined
            }
            onSelectRegion={preview || !renderPanel ? undefined : selectRegion}
            onSelectNavItem={
              preview || !renderPanel
                ? undefined
                : (index) => {
                    setNavItem(index);
                    setPanel('navbar');
                  }
            }
          >
            {preview
              ? undefined
              : childrenOf(parsed.tree).map((node, index) =>
                  render(node, String(index)),
                )}
          </CourseCanvas>
        </div>
        {panel && !narrow && (
          <aside className="homepage-panel" aria-label={panelTitle}>
            <div className="homepage-panel-header">
              <Text fw={700} size="lg">
                {panelTitle}
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Paneel sluiten"
                onClick={() => setPanel(null)}
              >
                <IconX size={16} />
              </ActionIcon>
            </div>
            {panelContent}
          </aside>
        )}
      </div>
      <Drawer
        opened={!!panel && !!narrow}
        onClose={() => setPanel(null)}
        title={panelTitle}
        position="bottom"
        size="80%"
        closeButtonProps={{ 'aria-label': 'Paneel sluiten' }}
      >
        {panelContent}
      </Drawer>
      <Modal
        opened={gallery !== null}
        onClose={() => setGallery(null)}
        title="Kies een sectie"
        size="lg"
        centered
      >
        <Text c="dimmed" size="sm" mb="md">
          Kies een beginpunt. Daarna pas je de inhoud direct op de pagina aan.
        </Text>
        <div className="homepage-section-gallery">
          {Object.entries(sectionLabels).map(([name, label]) => (
            <button
              key={name}
              type="button"
              aria-label={label}
              onClick={() => add(name)}
              className="homepage-gallery-item"
            >
              <div
                className={`homepage-miniature miniature-${name.toLowerCase()}`}
                aria-hidden="true"
              >
                {name === 'Picture' ? (
                  <IconPhoto size={36} />
                ) : name === 'Divider' ? (
                  <hr />
                ) : (
                  <>
                    <i />
                    <i />
                    <div>
                      <i />
                      <i />
                      <i />
                    </div>
                  </>
                )}
              </div>
              <strong>{label}</strong>
              <span>
                {
                  {
                    Hero: 'Een welkom met een duidelijke titel',
                    Section: 'Een titel met ruimte voor je verhaal',
                    Columns: 'Inhoud naast elkaar',
                    Card: 'Een onderwerp uitlichten',
                    Buttons: 'Een groep handige links',
                    Button: 'Een duidelijke volgende stap',
                    Picture: 'Een foto of illustratie',
                    Divider: 'Rust tussen twee onderdelen',
                  }[name]
                }
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </Stack>
  );
}

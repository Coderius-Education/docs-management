import {
  createElement,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import type { LessonNode } from '../authoring/syntax';
import { codeModel, headingModel, type TabsModel } from '../authoring/content';

export function CodePreview({
  node,
  source,
}: {
  node: LessonNode;
  source: string;
}) {
  const model = codeModel(node, source);
  const selected = (line: number) =>
    model?.highlights.split(',').some((part) => {
      const [from, end] = part.trim().split('-').map(Number);
      return line >= from && line <= (end ?? from);
    });
  return (
    <figure className="preview-code">
      {model?.title && <figcaption>{model.title}</figcaption>}
      <pre>
        <code className={node.lang ? `language-${node.lang}` : undefined}>
          {(node.value ?? '').split('\n').map((line, index) => (
            <span
              key={index}
              data-line={index + (model?.lineNumberStart ?? 1)}
              data-highlighted={selected(index + 1) ? 'true' : undefined}
              style={{
                display: 'block',
                minHeight: '1.4em',
                background: selected(index + 1)
                  ? 'var(--mantine-color-blue-light, #dbeafe)'
                  : undefined,
              }}
            >
              {model?.lineNumbers && (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    minWidth: '3em',
                    paddingRight: '1em',
                    opacity: 0.55,
                    userSelect: 'none',
                  }}
                >
                  {index + model.lineNumberStart}
                </span>
              )}
              {line || '\n'}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
export function HeadingPreview({
  node,
  source,
  render,
}: {
  node: LessonNode;
  source: string;
  render: (node: LessonNode, index: number) => ReactNode;
}) {
  const model = headingModel(node, source);
  const children = [...(node.children ?? [])];
  if (model?.id) {
    const last = children.at(-1);
    if (last?.type === 'text')
      children[children.length - 1] = {
        ...last,
        value: last.value?.replace(/\s*\{#[^\s{}]+\}\s*$/, ''),
      };
    else if (
      last?.type === 'mdxTextExpression' &&
      /^\/\*\s*#[^\s{}]+\s*\*\/$/.test(last.value?.trim() ?? '')
    ) {
      children.pop();
      const tail = children.at(-1);
      if (tail?.type === 'text')
        children[children.length - 1] = {
          ...tail,
          value: tail.value?.trimEnd(),
        };
    }
  }
  return createElement(
    `h${Math.max(1, Math.min(node.depth ?? 2, 6))}`,
    { id: model?.id || undefined },
    children.map(render),
  );
}
export function TabsPreview({
  model,
  render,
}: {
  model: TabsModel;
  render: (node: LessonNode, index: number) => ReactNode;
}) {
  const id = useId();
  const initial =
    model.defaultValue.value === null
      ? null
      : model.defaultValue.value ||
        model.items.find((item) => item.default.value === true)?.value.value ||
        model.items[0]?.value.value;
  const [choice, setChoice] = useState<string | null>(
    initial === null ? null : String(initial ?? ''),
  );
  useEffect(() => {
    setChoice(initial === null ? null : String(initial ?? ''));
  }, [initial]);
  const active =
    choice !== null &&
    !model.items.some((item) => String(item.value.value) === choice)
      ? String(initial ?? '')
      : choice;
  return (
    <div className="preview-tabs">
      <div
        role="tablist"
        aria-label="Tabbladen"
        style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        {model.items.map((item, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={active === String(item.value.value)}
            tabIndex={
              active === String(item.value.value) ||
              (active === null && index === 0)
                ? 0
                : -1
            }
            onClick={() => setChoice(String(item.value.value))}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % model.items.length
                  : event.key === 'ArrowLeft'
                    ? (index - 1 + model.items.length) % model.items.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? model.items.length - 1
                        : undefined;
              if (next === undefined) return;
              event.preventDefault();
              setChoice(String(model.items[next].value.value));
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
            style={{
              border: 0,
              borderBottom:
                active === String(item.value.value)
                  ? '2px solid var(--mantine-color-blue-6, #2563eb)'
                  : '2px solid transparent',
              padding: '8px 14px',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            {String(
              item.label.value || item.value.value || `Tabblad ${index + 1}`,
            )}
          </button>
        ))}
      </div>
      {model.items.map((item, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== String(item.value.value)}
          style={{ paddingTop: 12 }}
        >
          {item.node.children?.map(render)}
        </div>
      ))}
      {(!model.groupId.editable ||
        !model.defaultValue.editable ||
        !model.canChangeItems) && (
        <small>
          Dynamische tabinstellingen worden in het cursusvoorbeeld uitgevoerd.
        </small>
      )}
    </div>
  );
}

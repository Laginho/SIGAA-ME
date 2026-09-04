/**
 * Construtor mínimo de nós (SEC-001).
 *
 * Todo dado — do SIGAA, de config, de contador — vira nó por aqui, por
 * `textContent` ou por atribuição de propriedade. String vira `Text`, nunca
 * HTML: é o que substitui a interpolação em `innerHTML` e os atributos
 * `data-*` montados por template.
 */

type Child = Node | string | null | undefined | false

interface HProps {
  className?: string
  id?: string
  title?: string
  /** Vai para `el.dataset[k]`: atributo seguro por construção. */
  dataset?: Record<string, string>
  onClick?: (e: MouseEvent) => void
}

/** Nó com filhos; string vira Text (nunca HTML). `null`/`undefined`/`false` é ignorado. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: HProps,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props?.className !== undefined) el.className = props.className
  if (props?.id !== undefined) el.id = props.id
  if (props?.title !== undefined) el.title = props.title
  if (props?.dataset) {
    for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v
  }
  if (props?.onClick) {
    const handleClick = props.onClick
    el.addEventListener('click', (e) => handleClick(e as MouseEvent))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    el.append(child)
  }
  return el
}

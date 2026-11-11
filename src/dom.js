export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function icon(name) {
  const node = element("ha-icon");
  node.icon = name;
  node.setAttribute("aria-hidden", "true");
  return node;
}

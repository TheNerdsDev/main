/**
 * Splits an element's text into line-wrapped spans for masked reveals.
 * Produces: <span class="line"><span class="line-inner">…</span></span>
 */
export default class SplitText {
  constructor(el) {
    this.el = el;
    this.original = el.innerHTML;
    this.lines = [];
    this.split();
  }

  split() {
    /* Words keep their inline markup (e.g. <strong>), so emphasis survives the split. */
    const words = [];
    this.el.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        n.textContent.split(/\s+/).filter(Boolean).forEach((w) => words.push(w.replace(/&/g, '&amp;').replace(/</g, '&lt;')));
      } else if (n.nodeType === 1) {
        n.textContent.split(/\s+/).filter(Boolean).forEach((w) => {
          const el = n.cloneNode(false);
          el.textContent = w;
          words.push(el.outerHTML);
        });
      }
    });
    if (!words.length) return;

    /* 1 — wrap every word so we can measure where it lands */
    this.el.innerHTML = words
      .map((w) => `<span class="split-word" style="white-space:nowrap">${w}</span>`)
      .join(' ');

    const spans = [...this.el.querySelectorAll('.split-word')];
    if (!spans.length) return;

    /* 2 — group words sharing a vertical offset into one line */
    const rows = [];
    let lastTop = null;
    spans.forEach((w) => {
      const top = w.offsetTop;
      if (lastTop === null || Math.abs(top - lastTop) > 2) {
        rows.push([]);
        lastTop = top;
      }
      rows[rows.length - 1].push(w.innerHTML);
    });

    /* 3 — rebuild as masked lines */
    this.el.innerHTML = rows
      .map((r) => `<span class="line"><span class="line-inner">${r.join(' ')}</span></span>`)
      .join('');

    this.lines = [...this.el.querySelectorAll('.line-inner')];
  }

  revert() {
    this.el.innerHTML = this.original;
    this.lines = [];
  }

  resize() {
    this.revert();
    this.split();
  }
}

/** Collect every reveal target on a page, splitting paragraphs on the fly. */
export const collectLines = (root) => {
  const instances = [];
  const lines = [];

  root.querySelectorAll('[data-split-lines]').forEach((el) => {
    const s = new SplitText(el);
    instances.push(s);
    lines.push(...s.lines);
  });

  root.querySelectorAll('[data-split] .line-inner').forEach((el) => lines.push(el));

  return { instances, lines };
};

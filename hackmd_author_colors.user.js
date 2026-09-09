// ==UserScript==
// @name         HackMD Author Colors
// @name:ja      HackMD Author Colors
// @namespace    https://github.com/riantkb/hackmd_author_colors
// @version      0.1.0
// @description  Replace HackMD collaborator colors with a more distinguishable palette, with optional per-note color settings.
// @description:ja HackMD の共同編集者の色を見分けやすい色に置き換え、ノートごとの色指定にも対応します。
// @license      MIT
// @match        https://hackmd.io/*
// @homepageURL  https://github.com/riantkb/hackmd_author_colors
// @supportURL   https://github.com/riantkb/hackmd_author_colors/issues
// @updateURL    https://raw.githubusercontent.com/riantkb/hackmd_author_colors/main/hackmd_author_colors.user.js
// @downloadURL  https://raw.githubusercontent.com/riantkb/hackmd_author_colors/main/hackmd_author_colors.user.js
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const PALETTE = [
    "#E41A1C",
    "#377EB8",
    "#4DAF4A",
    "#984EA3",
    "#FF7F00",
    "#00A6D6",
    "#F032E6",
    "#7A9A01",
    "#A65628",
    "#F781BF",
    "#008080",
    "#6A5ACD",
  ];

  const MAX_FRONT_MATTER_LINES = 500;
  const CONFIG_REFRESH_DELAY_MS = 100;
  const EDITOR_POLL_INTERVAL_MS = 500;

  let editor = null;
  let editorObserver = null;
  let observedEditorElement = null;
  let initializationTimer = null;
  let refreshTimer = null;

  let configuredColors = new Map();
  let automaticColors = new Map();
  const seenAuthors = new Set();

  let lastConfigSignature = null;

  function normalizeAuthorName(name) {
    if (typeof name !== "string") return null;

    const normalized = name.replace(/\u00A0/g, " ").trim();

    return normalized || null;
  }

  function normalizeHex(color) {
    if (typeof color !== "string") return null;

    const value = color.trim();

    let match = value.match(/^#([0-9a-f]{6})$/i);
    if (match) {
      return `#${match[1].toUpperCase()}`;
    }

    match = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);

    if (match) {
      return (
        "#" +
        match
          .slice(1)
          .map((ch) => ch + ch)
          .join("")
          .toUpperCase()
      );
    }

    return null;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return null;

    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16),
    };
  }

  function hexToRgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  /*
   * Use OKLab rather than raw RGB distance when choosing automatic
   * colors. This is closer to perceived visual difference.
   */
  function srgbChannelToLinear(value) {
    const x = value / 255;

    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }

  function hexToOklab(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;

    const r = srgbChannelToLinear(rgb.r);
    const g = srgbChannelToLinear(rgb.g);
    const b = srgbChannelToLinear(rgb.b);

    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;

    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;

    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const lRoot = Math.cbrt(l);
    const mRoot = Math.cbrt(m);
    const sRoot = Math.cbrt(s);

    return {
      L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,

      a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,

      b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
    };
  }

  function colorDistanceSquared(a, b) {
    const x = hexToOklab(a);
    const y = hexToOklab(b);

    if (!x || !y) return 0;

    return (x.L - y.L) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2;
  }

  function chooseAutomaticColor(usedColors) {
    const normalizedUsedColors = usedColors.map(normalizeHex).filter(Boolean);

    if (normalizedUsedColors.length === 0) {
      return PALETTE[0];
    }

    let bestColor = null;
    let bestDistance = -1;

    for (const candidate of PALETTE) {
      if (normalizedUsedColors.includes(candidate)) {
        continue;
      }

      let minDistance = Infinity;

      for (const used of normalizedUsedColors) {
        minDistance = Math.min(minDistance, colorDistanceSquared(candidate, used));
      }

      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        bestColor = candidate;
      }
    }

    // More authors than palette entries.
    if (bestColor === null) {
      bestColor = PALETTE[automaticColors.size % PALETTE.length];
    }

    return bestColor;
  }

  function rebuildAutomaticColors() {
    automaticColors = new Map();

    const usedColors = [...new Set(configuredColors.values())];

    for (const author of seenAuthors) {
      if (configuredColors.has(author)) {
        continue;
      }

      const color = chooseAutomaticColor(usedColors);

      automaticColors.set(author, color);
      usedColors.push(color);
    }
  }

  function getColorForAuthor(author) {
    const normalizedAuthor = normalizeAuthorName(author);

    if (!normalizedAuthor) return null;

    if (!seenAuthors.has(normalizedAuthor)) {
      seenAuthors.add(normalizedAuthor);

      if (!configuredColors.has(normalizedAuthor)) {
        const usedColors = [...configuredColors.values(), ...automaticColors.values()];

        automaticColors.set(normalizedAuthor, chooseAutomaticColor(usedColors));
      }
    }

    return configuredColors.get(normalizedAuthor) ?? automaticColors.get(normalizedAuthor) ?? null;
  }

  /*
   * Minimal YAML support.
   *
   * Supported:
   *
   * ---
   * author-colors:
   *   Alice: "#E41A1C"
   *   "Bob Smith": '#377EB8'
   * ---
   *
   * This is intentionally not a general-purpose YAML parser.
   */

  function parseYamlScalar(value) {
    const trimmed = value.trim();

    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed.slice(1, -1);
      }
    }

    if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1).replace(/''/g, "'");
    }

    return trimmed;
  }

  function stripYamlComment(value) {
    let singleQuoted = false;
    let doubleQuoted = false;

    for (let i = 0; i < value.length; ++i) {
      const ch = value[i];

      if (ch === "'" && !doubleQuoted) {
        if (singleQuoted && value[i + 1] === "'") {
          ++i;
          continue;
        }

        singleQuoted = !singleQuoted;
        continue;
      }

      if (ch === '"' && !singleQuoted) {
        let backslashes = 0;

        for (let j = i - 1; j >= 0 && value[j] === "\\"; --j) {
          ++backslashes;
        }

        if (backslashes % 2 === 0) {
          doubleQuoted = !doubleQuoted;
        }

        continue;
      }

      if (ch === "#" && !singleQuoted && !doubleQuoted && (i === 0 || /\s/.test(value[i - 1]))) {
        return value.slice(0, i).trimEnd();
      }
    }

    return value;
  }

  function splitYamlMappingLine(line) {
    let singleQuoted = false;
    let doubleQuoted = false;

    for (let i = 0; i < line.length; ++i) {
      const ch = line[i];

      if (ch === "'" && !doubleQuoted) {
        if (singleQuoted && line[i + 1] === "'") {
          ++i;
          continue;
        }

        singleQuoted = !singleQuoted;
        continue;
      }

      if (ch === '"' && !singleQuoted) {
        let backslashes = 0;

        for (let j = i - 1; j >= 0 && line[j] === "\\"; --j) {
          ++backslashes;
        }

        if (backslashes % 2 === 0) {
          doubleQuoted = !doubleQuoted;
        }

        continue;
      }

      if (ch === ":" && !singleQuoted && !doubleQuoted) {
        return [line.slice(0, i), line.slice(i + 1)];
      }
    }

    return null;
  }

  /*
   * Read only the front matter instead of editor.getValue().
   *
   * This avoids scanning a potentially large HackMD note whenever
   * something is edited.
   */
  function getFrontMatterLines() {
    if (!editor || typeof editor.getLine !== "function") {
      return null;
    }

    if (editor.lineCount() === 0 || editor.getLine(0).trim() !== "---") {
      return null;
    }

    const lines = ["---"];

    const limit = Math.min(editor.lineCount(), MAX_FRONT_MATTER_LINES);

    for (let i = 1; i < limit; ++i) {
      const line = editor.getLine(i);
      lines.push(line);

      if (line.trim() === "---") {
        return lines;
      }
    }

    return null;
  }

  function parseAuthorColors(frontMatterLines) {
    const result = new Map();

    if (!frontMatterLines || frontMatterLines.length < 2) {
      return result;
    }

    let inAuthorColors = false;
    let entryIndent = null;

    for (let i = 1; i < frontMatterLines.length - 1; ++i) {
      const line = frontMatterLines[i];

      if (/^\s*(?:#.*)?$/.test(line)) {
        continue;
      }

      // YAML indentation with tabs is intentionally unsupported.
      if (/^\t/.test(line)) {
        continue;
      }

      const indent = line.match(/^ */)[0].length;

      const trimmed = line.trim();

      if (!inAuthorColors) {
        /*
         * author-colors must be a top-level key.
         */
        if (indent === 0 && /^author-colors\s*:\s*(?:#.*)?$/.test(trimmed)) {
          inAuthorColors = true;
        }

        continue;
      }

      /*
       * Another top-level key ends author-colors.
       */
      if (indent === 0) {
        break;
      }

      if (entryIndent === null) {
        entryIndent = indent;
      }

      /*
       * Only accept a flat mapping:
       *
       * author-colors:
       *   Alice: ...
       *   Bob: ...
       */
      if (indent !== entryIndent) {
        console.warn("[HackMD Author Colors] " + "Ignoring nested or malformed entry:", line);
        continue;
      }

      const content = line.slice(indent);

      const pair = splitYamlMappingLine(content);

      if (!pair) {
        console.warn("[HackMD Author Colors] " + "Ignoring invalid entry:", line);
        continue;
      }

      let [rawName, rawColor] = pair;

      rawName = stripYamlComment(rawName).trim();

      rawColor = stripYamlComment(rawColor).trim();

      const author = normalizeAuthorName(parseYamlScalar(rawName));

      const color = normalizeHex(parseYamlScalar(rawColor));

      if (!author || !color) {
        console.warn("[HackMD Author Colors] " + "Ignoring invalid entry:", line);
        continue;
      }

      result.set(author, color);
    }

    return result;
  }

  function refreshConfiguration() {
    if (!editor) return;

    const newConfiguration = parseAuthorColors(getFrontMatterLines());

    const signature = JSON.stringify([...newConfiguration.entries()]);

    if (signature === lastConfigSignature) {
      return;
    }

    lastConfigSignature = signature;
    configuredColors = newConfiguration;

    rebuildAutomaticColors();
    recolorEverything();
  }

  function scheduleConfigurationRefresh() {
    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(refreshConfiguration, CONFIG_REFRESH_DELAY_MS);
  }

  function getAuthorFromAuthorshipElement(element) {
    /*
     * Bootstrap may move title to data-original-title.
     */
    return normalizeAuthorName(element.getAttribute("title") || element.getAttribute("data-original-title"));
  }

  function applyAuthorshipColor(element) {
    if (!(element instanceof Element)) {
      return;
    }

    const isGutter = element.classList.contains("authorship-gutter");

    const isInline = element.classList.contains("authorship-inline");

    if (!isGutter && !isInline) {
      return;
    }

    const author = getAuthorFromAuthorshipElement(element);

    if (!author) return;

    const color = getColorForAuthor(author);

    if (!color) return;

    if (element.dataset.hackmdAuthorColor === color) {
      return;
    }

    element.dataset.hackmdAuthorColor = color;

    if (isGutter) {
      element.style.setProperty("border-left-color", color, "important");
    }

    if (isInline) {
      element.style.setProperty(
        "background-image",
        `linear-gradient(to top, ${hexToRgba(color, 0.95)} 1px, transparent 1px)`,
        "important"
      );
    }
  }

  function parseCssColor(color) {
    if (!color) return null;

    const match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);

    if (match) {
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
      };
    }

    return hexToRgb(color);
  }

  function sameColor(a, b) {
    const x = parseCssColor(a);
    const y = parseCssColor(b);

    if (!x || !y) {
      return false;
    }

    return x.r === y.r && x.g === y.g && x.b === y.b;
  }

  function applyCursorColor(cursor) {
    if (!(cursor instanceof Element)) {
      return;
    }

    if (!cursor.matches(".CodeMirror-other-cursor")) {
      return;
    }

    const nameElement = cursor.querySelector(".cursortag .name");

    const author = normalizeAuthorName(nameElement?.textContent);

    if (!author) return;

    const color = getColorForAuthor(author);

    if (!color) return;

    const bar = cursor.querySelector(".cursorbar");

    if (bar && !sameColor(bar.style.borderLeftColor, color)) {
      bar.style.setProperty("border-left-color", color, "important");
    }

    const tag = cursor.querySelector(".cursortag");

    if (tag && !sameColor(tag.style.color, color)) {
      tag.style.setProperty("color", color, "important");
    }
  }

  function scan(root) {
    if (!(root instanceof Element) && root !== document) {
      return;
    }

    if (root instanceof Element) {
      applyAuthorshipColor(root);

      if (root.matches(".CodeMirror-other-cursor")) {
        applyCursorColor(root);
      }

      const containingCursor = root.closest(".CodeMirror-other-cursor");

      if (containingCursor) {
        applyCursorColor(containingCursor);
      }
    }

    root.querySelectorAll?.(".authorship-gutter, " + ".authorship-inline").forEach(applyAuthorshipColor);

    root.querySelectorAll?.(".CodeMirror-other-cursor").forEach(applyCursorColor);
  }

  function recolorEverything() {
    document.querySelectorAll(".authorship-gutter, " + ".authorship-inline").forEach((element) => {
      delete element.dataset.hackmdAuthorColor;

      applyAuthorshipColor(element);
    });

    document.querySelectorAll(".CodeMirror-other-cursor").forEach(applyCursorColor);
  }

  function observeEditorDom() {
    const editorElement = document.querySelector(".CodeMirror");

    if (!editorElement || editorElement === observedEditorElement) {
      return;
    }

    editorObserver?.disconnect();

    observedEditorElement = editorElement;

    editorObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
              scan(node);
            }
          }
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          const element = mutation.target;

          applyAuthorshipColor(element);

          const cursor = element.closest(".CodeMirror-other-cursor");

          if (cursor) {
            applyCursorColor(cursor);
          }
        }
      }
    });

    editorObserver.observe(editorElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "title", "data-original-title"],
    });

    scan(editorElement);
  }

  function findEditor() {
    const candidate = window.editor || document.querySelector(".CodeMirror")?.CodeMirror;

    if (
      candidate &&
      typeof candidate.getLine === "function" &&
      typeof candidate.lineCount === "function" &&
      typeof candidate.on === "function"
    ) {
      return candidate;
    }

    return null;
  }

  function initializeEditor() {
    if (!editor) {
      editor = findEditor();

      if (editor) {
        refreshConfiguration();

        editor.on("changes", scheduleConfigurationRefresh);
      }
    }

    observeEditorDom();

    return Boolean(editor);
  }

  initializationTimer = setInterval(() => {
    const editorReady = initializeEditor();

    if (editorReady && observedEditorElement) {
      clearInterval(initializationTimer);

      initializationTimer = null;
    }
  }, EDITOR_POLL_INTERVAL_MS);

  initializeEditor();

  /*
   * Debug helpers:
   *
   * hackmdAuthorColors.configured
   * hackmdAuthorColors.automatic
   * hackmdAuthorColors.seen
   * hackmdAuthorColors.refresh()
   */
  window.hackmdAuthorColors = {
    get configured() {
      return Object.fromEntries(configuredColors);
    },

    get automatic() {
      return Object.fromEntries(automaticColors);
    },

    get seen() {
      return [...seenAuthors];
    },

    refresh() {
      lastConfigSignature = null;

      refreshConfiguration();
      recolorEverything();
    },
  };
})();

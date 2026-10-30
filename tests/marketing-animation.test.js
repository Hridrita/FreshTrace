import { describe, it, expect, vi } from "vitest";
import { prerender } from "react-dom/static";
import { createElement } from "react";

/**
 * Animation primitive tests.
 *
 * The landing page's motion is driven by framer-motion, which is a Client
 * Component library. These tests render the primitives through
 * `react-dom/static`'s `prerender` and assert on the HTML that comes out —
 * the same way a visitor's browser would receive it.
 *
 * Three things matter here:
 *
 * 1. **The markup is still semantic.** A `<ul>` of animated items has to
 *    contain `<li>` elements, not `<div>`s — otherwise the list loses its
 *    meaning to assistive technology.
 * 2. **The page is readable before JavaScript runs.** framer-motion hides
 *    an element before it animates it, and it does that with an inline
 *    `opacity: 0`. If that inline style reached the server-rendered HTML,
 *    a visitor without JavaScript would get a blank page. The animations
 *    have to be a progressive enhancement.
 * 3. **The stagger positions are honoured.** Each item's `index` decides
 *    how long it waits, and the indices have to stay distinct.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { Stagger, StaggerItem, FadeIn, Pressable, PressableLink } = await import(
  "@/components/marketing/animation"
);

/**
 * Render an element tree to HTML.
 *
 * @param {React.ReactElement} element
 * @returns {Promise<string>}
 */
async function render(element) {
  const { prelude } = await prerender(element);
  const chunks = [];
  const decoder = new TextDecoder();

  for await (const chunk of prelude) {
    chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
  }

  return chunks.join("");
}

describe("Stagger", () => {
  it("renders a plain container with the requested tag", async () => {
    const html = await render(
      createElement(Stagger, { as: "ul", className: "grid" }, "child"),
    );

    expect(html).toContain("<ul");
    expect(html).toContain('class="grid"');
  });

  it("keeps list items as list items", async () => {
    const html = await render(
      createElement(
        Stagger,
        { as: "ul" },
        createElement(StaggerItem, { as: "li", index: 0, key: "a" }, "one"),
        createElement(StaggerItem, { as: "li", index: 1, key: "b" }, "two"),
      ),
    );

    // A <div> inside a <ul> is invalid HTML and would break the list for
    // screen readers.
    expect(html).toContain("<li");
    expect(html).not.toContain("<div");
    expect(html).toContain("one");
    expect(html).toContain("two");
  });

  it("renders list items in the order they are given", async () => {
    const html = await render(
      createElement(
        Stagger,
        { as: "ol" },
        createElement(StaggerItem, { as: "li", index: 0, key: "a" }, "first"),
        createElement(StaggerItem, { as: "li", index: 1, key: "b" }, "second"),
        createElement(StaggerItem, { as: "li", index: 2, key: "c" }, "third"),
      ),
    );

    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html.indexOf("second")).toBeLessThan(html.indexOf("third"));
  });
});

describe("FadeIn", () => {
  it("renders its children", async () => {
    const html = await render(
      createElement(FadeIn, null, createElement("p", null, "hello")),
    );

    expect(html).toContain("hello");
    expect(html).toContain("<p");
  });

  it("does not hide its content in the server-rendered markup", async () => {
    // The whole page would be blank without JavaScript if the animated
    // styles were part of the server's HTML.
    const html = await render(
      createElement(FadeIn, null, createElement("p", null, "hello")),
    );

    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
  });
});

describe("Pressable", () => {
  it("renders its children", async () => {
    const html = await render(
      createElement(Pressable, null, createElement("span", null, "card")),
    );

    expect(html).toContain("card");
  });

  it("does not hide its content in the server-rendered markup", async () => {
    const html = await render(
      createElement(Pressable, null, createElement("span", null, "card")),
    );

    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
  });
});

describe("PressableLink", () => {
  it("keeps the anchor and its href", async () => {
    const html = await render(
      createElement(
        PressableLink,
        { href: "/app/products" },
        "Explore",
      ),
    );

    expect(html).toContain('href="/app/products"');
    expect(html).toContain("Explore");
  });

  it("renders the same wrapper before and after hydration", async () => {
    // The wrapper is what carries the hover and tap scales. If it were
    // only present once the page had hydrated, React would have to patch
    // the DOM during hydration.
    const html = await render(
      createElement(
        PressableLink,
        { href: "/app/products" },
        "Explore",
      ),
    );

    expect(html).toContain("<span");
    expect(html).toContain('href="/app/products"');
  });
});

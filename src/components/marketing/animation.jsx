"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Animation primitives for the landing page.
 *
 * The landing page is the one place in the app where motion is used, so the
 * building blocks live here rather than in a shared UI package: nothing else
 * on the site imports them, and nothing else should start to.
 *
 * Four ideas cover every animation the page needs:
 *
 * - **`FadeIn`** — one element that fades in and slides up when it enters
 *   the viewport. Used for headings, paragraphs and single cards.
 * - **`Stagger`** — a group of elements that animate in sequence.
 * - **`StaggerItem`** — one member of such a group. It takes its delay
 *   from the group and its position from the `index` prop, so a list of
 *   cards animates one after another.
 * - **`Pressable`** — a card or button that responds to a hover and a tap.
 * - **`PressableLink`** — a link that behaves like a button, while staying
 *   a real anchor.
 *
 * ## Reduced motion
 *
 * `globals.css` collapses CSS animation and transition durations when the
 * visitor prefers reduced motion, but framer-motion's animations are driven
 * by JavaScript, so that rule does not reach them. `useReducedMotion()` is
 * the correct hook here: when it reports a preference, the offsets collapse
 * to zero and the elements are simply present rather than animated.
 *
 * ## Viewport triggering
 *
 * Every `whileInView` uses `once: true` with `amount: 0.2`, so an element
 * animates a single time as it comes into view and stays put afterwards —
 * scrolling back up does not replay it, and an element that is already
 * partly on screen when the page loads still animates.
 *
 * ## The page without JavaScript
 *
 * framer-motion hides an element before it animates it, and it does that by
 * writing `opacity: 0` into the element's inline style. Rendered on the
 * server, that inline style is part of the HTML the browser receives — so a
 * visitor with JavaScript disabled, or whose script fails to load, would
 * see a blank page.
 *
 * The animations are therefore a **progressive enhancement**. The server
 * sends visible markup; the client hides each element on hydration and
 * animates it back in. `useHasMounted` is what draws that line: before the
 * first client render the primitives return plain, visible elements, and
 * only afterwards do they hand over to framer-motion.
 */

/** Shared viewport configuration — see the note above. */
export const VIEWPORT = { once: true, amount: 0.2 };

/** The distance an element travels while fading in. */
const RISE = 24;

/** The easing curve used for every entrance. */
const EASE = [0.22, 1, 0.36, 1];

/**
 * The animated variants, created once at module scope.
 *
 * `motion.create` returns a new component, so it must not be called during
 * a render — that would remount the subtree on every pass. Two tags are
 * enough for this page: a `<div>` for generic blocks and an `<li>` for
 * list items.
 */
const MotionDiv = motion.div;
const MotionLi = motion.li;

/**
 * Whether the component has hydrated on the client.
 *
 * `false` during the server render and during the first client render —
 * the two must agree, or React discards the server markup and warns
 * about a hydration mismatch. It flips to `true` once the client takes
 * over.
 *
 * `useSyncExternalStore` is the right tool here: it is React's own
 * answer to "am I on the client?", it does not schedule a second render
 * pass, and its server snapshot is the value the server rendered with.
 *
 * @returns {boolean}
 */
function useHasMounted() {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}

/**
 * Subscribe to "the client has taken over".
 *
 * The store never changes after hydration, so the subscription is a
 * no-op — but React still calls it, and that is what tells the hook the
 * client is now in charge.
 *
 * @returns {() => void}
 */
function subscribe() {
  return () => {};
}

/**
 * The snapshot on the client.
 *
 * @returns {boolean}
 */
function getClientSnapshot() {
  return true;
}

/**
 * The snapshot on the server.
 *
 * @returns {boolean}
 */
function getServerSnapshot() {
  return false;
}

/* ── Stagger group ──────────────────────────────────────────────────── */

/**
 * The context that carries a group's timing to its children.
 */
const StaggerContext = createContext({
  stagger: 0.09,
  delay: 0,
  reduceMotion: false,
});

/**
 * Read the surrounding stagger group.
 *
 * @returns {{stagger: number, delay: number, reduceMotion: boolean}}
 */
function useStagger() {
  return useContext(StaggerContext);
}

/**
 * A group whose children animate in sequence.
 *
 * The group renders a plain element and provides the shared timing. Children
 * read their delay from context, so the markup stays semantic — an `<ol>`
 * stays an `<ol>` and a `<ul>` stays a `<ul>`.
 *
 * ## How a child gets its position
 *
 * The child is told its position with the `index` prop. That is not
 * merely a convenience: the landing page's sections are **Server
 * Components**, so they hand `Stagger` a set of Client Component
 * references that React has already turned into opaque module
 * references. The parent cannot inspect those children to number them —
 * their `type` is not a function it can compare against, and it cannot
 * clone them to pass a prop down. Only the caller, which is right there
 * in a `map` over the data, knows the order.
 *
 * Passing the index is therefore the only mechanism that works across
 * the server/client boundary, and it is a short one: the call sites are
 * already mapping over an array.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {number} [props.stagger] Seconds between each child.
 * @param {number} [props.delay] Seconds before the first child starts.
 * @param {string} [props.className]
 * @param {"div" | "ul" | "ol"} [props.as] The element to render.
 */
export function Stagger({
  children,
  stagger = 0.09,
  delay = 0,
  className,
  as: Tag = "div",
}) {
  const reduceMotion = useReducedMotion();

  return (
    <StaggerContext.Provider value={{ stagger, delay, reduceMotion }}>
      <Tag className={className}>{children}</Tag>
    </StaggerContext.Provider>
  );
}

/**
 * One member of a `Stagger` group.
 *
 * `as` keeps the list semantics intact: pass `"li"` inside a `<ul>` or
 * `<ol>` so the animated element is still a list item rather than a `<div>`
 * in the wrong place.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {number} [props.index] Position in the group. It decides how
 *   long the item waits before it animates in.
 * @param {"div" | "li"} [props.as] The element to render.
 * @param {string} [props.className]
 * @param {React.ComponentPropsWithoutRef<typeof motion.div>} [props.rest]
 */
export function StaggerItem({
  children,
  index = 0,
  as: Tag = "div",
  className,
  ...rest
}) {
  const { stagger, delay, reduceMotion } = useStagger();
  const mounted = useHasMounted();

  // Before hydration, and when the visitor prefers reduced motion, the
  // element is simply there.
  if (!mounted || reduceMotion) {
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  const MotionTag = Tag === "li" ? MotionLi : MotionDiv;

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: RISE }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{
        duration: 0.55,
        delay: delay + index * stagger,
        ease: EASE,
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

/* ── Single elements ───────────────────────────────────────────────── */

/**
 * Fade in and slide up, once, when the element enters the viewport.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {number} [props.delay] Seconds to wait before starting.
 * @param {number} [props.y] Distance in pixels to travel.
 * @param {string} [props.className]
 * @param {React.ComponentPropsWithoutRef<typeof motion.div>} [props.rest]
 */
export function FadeIn({
  children,
  delay = 0,
  y = RISE,
  className,
  ...rest
}) {
  const reduceMotion = useReducedMotion();
  const mounted = useHasMounted();

  if (!mounted || reduceMotion) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <MotionDiv
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.6, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </MotionDiv>
  );
}

/**
 * A card or block that responds to a hover and a tap.
 *
 * The scale is deliberately small: `1.02` on hover and `0.98` on tap read as
 * a physical press rather than a glitch. Both are dropped when the visitor
 * prefers reduced motion.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {React.ComponentPropsWithoutRef<typeof motion.div>} [props.rest]
 */
export function Pressable({ children, className, ...rest }) {
  const reduceMotion = useReducedMotion();
  const mounted = useHasMounted();

  if (!mounted || reduceMotion) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <MotionDiv
      className={className}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      {...rest}
    >
      {children}
    </MotionDiv>
  );
}

/**
 * A link that behaves like a button: it presses, it hovers, and it stays a
 * real anchor.
 *
 * The anchor itself is untouched — it keeps its own `href`, its focus ring
 * and its keyboard behaviour — and only a wrapper around it animates. That
 * way "open in new tab" and middle-click still work exactly as they did
 * before the animation was added.
 *
 * The wrapper is present in both the server-rendered and the hydrated
 * markup, so the DOM shape does not change when the page takes over.
 *
 * The wrapper carries the width rather than the link, because an
 * `inline-flex` wrapper shrinks to its content: a `w-full` on the link
 * alone would only ever be a hundred percent of that shrunken box. The
 * link then fills the wrapper.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className] Classes for the link itself.
 * @param {string} [props.wrapperClassName] Classes for the wrapper.
 * @param {React.ComponentPropsWithoutRef<typeof Link>} [props.rest]
 */
export function PressableLink({
  children,
  className,
  wrapperClassName = "inline-flex w-full sm:w-auto",
  ...rest
}) {
  const reduceMotion = useReducedMotion();
  const mounted = useHasMounted();

  if (!mounted || reduceMotion) {
    return (
      <span className={wrapperClassName}>
        <Link className={`w-full ${className ?? ""}`} {...rest}>
          {children}
        </Link>
      </span>
    );
  }

  return (
    <motion.span
      className={wrapperClassName}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Link className={`w-full ${className ?? ""}`} {...rest}>
        {children}
      </Link>
    </motion.span>
  );
}

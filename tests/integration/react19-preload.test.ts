import { afterEach, describe, expect, it } from "vitest"
import {
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
} from "../../src/compat"

describe("React 19 resource preloading", () => {
  afterEach(() => {
    // Clear any tags injected by previous tests.
    document.head.innerHTML = ""
  })

  it("prefetchDNS inserts a <link rel=dns-prefetch>", () => {
    prefetchDNS("https://example.com")
    const link = document.head.querySelector("link[rel=dns-prefetch]") as HTMLLinkElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute("href")).toBe("https://example.com")
  })

  it("preconnect inserts a <link rel=preconnect>", () => {
    preconnect("https://cdn.example.com", { crossOrigin: "anonymous" })
    const link = document.head.querySelector("link[rel=preconnect]") as HTMLLinkElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute("crossOrigin")).toBe("anonymous")
  })

  it("preload inserts a <link rel=preload> with as=", () => {
    preload("/fonts/body.woff2", { as: "font", crossOrigin: "anonymous", type: "font/woff2" })
    const link = document.head.querySelector('link[rel=preload]') as HTMLLinkElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute("as")).toBe("font")
    expect(link!.getAttribute("type")).toBe("font/woff2")
  })

  it("preloadModule inserts a <link rel=modulepreload>", () => {
    preloadModule("/js/lib.mjs")
    const link = document.head.querySelector("link[rel=modulepreload]") as HTMLLinkElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute("href")).toBe("/js/lib.mjs")
  })

  it("preinit with as=style inserts a stylesheet link", () => {
    preinit("/css/app.css", { as: "style" })
    const link = document.head.querySelector('link[rel=stylesheet]') as HTMLLinkElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute("href")).toBe("/css/app.css")
  })

  it("preinit with as=script inserts an async script", () => {
    preinit("/js/analytics.js", { as: "script" })
    const script = document.head.querySelector("script") as HTMLScriptElement | null
    expect(script).not.toBeNull()
    expect(script!.getAttribute("src")).toBe("/js/analytics.js")
    expect(script!.async).toBe(true)
  })

  it("preinitModule inserts a <script type=module> asynchronously", () => {
    preinitModule("/js/app.mjs")
    const script = document.head.querySelector("script[type=module]") as HTMLScriptElement | null
    expect(script).not.toBeNull()
    expect(script!.getAttribute("src")).toBe("/js/app.mjs")
  })

  it("deduplicates repeated preload calls by href", () => {
    preload("/img/hero.webp", { as: "image" })
    preload("/img/hero.webp", { as: "image" })
    preload("/img/hero.webp", { as: "image" })
    const links = document.head.querySelectorAll("link[rel=preload]")
    expect(links.length).toBe(1)
  })

  it("deduplicates repeated preinit stylesheet calls", () => {
    preinit("/css/a.css", { as: "style" })
    preinit("/css/a.css", { as: "style" })
    const links = document.head.querySelectorAll("link[rel=stylesheet]")
    expect(links.length).toBe(1)
  })
})

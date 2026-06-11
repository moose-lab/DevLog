import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateApiRequest } from "../../lib/request-origin-guard";

/**
 * Regression tests for CR-6 (REVIEW-2026-06-10): every state-changing API
 * route was reachable cross-origin (CSRF from any webpage, DNS rebinding to
 * 127.0.0.1). The guard must reject non-local Hosts and cross-origin writes.
 */

test("blocks mutating requests with a cross-origin Origin header", () => {
  const verdict = evaluateApiRequest({
    method: "POST",
    origin: "https://evil.example",
    secFetchSite: null,
    host: "localhost:3333",
  });
  assert.equal(verdict.allowed, false);
});

test("blocks mutating requests marked cross-site by Sec-Fetch-Site", () => {
  const verdict = evaluateApiRequest({
    method: "DELETE",
    origin: null,
    secFetchSite: "cross-site",
    host: "127.0.0.1:3333",
  });
  assert.equal(verdict.allowed, false);
});

test("blocks any request whose Host is not loopback (DNS rebinding)", () => {
  const verdict = evaluateApiRequest({
    method: "GET",
    origin: null,
    secFetchSite: null,
    host: "devlog.attacker.example:3333",
  });
  assert.equal(verdict.allowed, false);
});

test("blocks mutating requests with an opaque 'null' Origin", () => {
  const verdict = evaluateApiRequest({
    method: "POST",
    origin: "null",
    secFetchSite: null,
    host: "localhost:3333",
  });
  assert.equal(verdict.allowed, false);
});

test("allows same-origin browser mutations", () => {
  const verdict = evaluateApiRequest({
    method: "POST",
    origin: "http://localhost:3333",
    secFetchSite: "same-origin",
    host: "localhost:3333",
  });
  assert.equal(verdict.allowed, true);
});

test("allows local reads and headerless CLI clients", () => {
  assert.equal(
    evaluateApiRequest({
      method: "GET",
      origin: null,
      secFetchSite: null,
      host: "127.0.0.1:3000",
    }).allowed,
    true
  );
  // curl-style request: no Origin, no Sec-Fetch-Site
  assert.equal(
    evaluateApiRequest({
      method: "POST",
      origin: null,
      secFetchSite: null,
      host: "localhost:3333",
    }).allowed,
    true
  );
});

test("allows IPv6 loopback hosts", () => {
  const verdict = evaluateApiRequest({
    method: "POST",
    origin: "http://[::1]:3333",
    secFetchSite: "same-origin",
    host: "[::1]:3333",
  });
  assert.equal(verdict.allowed, true);
});

test("blocks requests with a missing Host header", () => {
  const verdict = evaluateApiRequest({
    method: "GET",
    origin: null,
    secFetchSite: null,
    host: null,
  });
  assert.equal(verdict.allowed, false);
});
